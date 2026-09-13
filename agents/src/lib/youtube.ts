/**
 * YouTube Shorts yüklemesi (PLAN.md Bölüm 11.9). Reels videosu (9:16, <60 sn)
 * YouTube'a yüklendiğinde otomatik olarak Shorts sayılır.
 *
 * Trend Ajanı'nın kullandığı YOUTUBE_API_KEY yalnızca OKUMA yapabilir; video
 * yüklemek kanal sahibinin OAuth onayını ister. Kurulum bir kez yapılır:
 *   npm run youtube-yetkilendir   (yerelde, tarayıcıda Google hesabıyla onay)
 * → çıkan refresh token GitHub Secrets'a YOUTUBE_REFRESH_TOKEN olarak eklenir
 * (YOUTUBE_OAUTH_CLIENT_ID / YOUTUBE_OAUTH_CLIENT_SECRET ile birlikte).
 *
 * ÖNEMLİ kısıt (Google politikası): denetimden (YouTube API Services audit)
 * geçmemiş bir Google Cloud projesinden yüklenen videolar YouTube tarafından
 * "özel" (private) olarak kilitlenir. Denetim başvurusu ücretsizdir; onaylanana
 * kadar videolar yüklenir ama herkese açık görünmez. Sağlık denetimi bunu
 * yüklenen videonun gerçek gizlilik durumuna bakarak raporlar.
 */
import { optionalEnv } from "./env.js";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const YOUTUBE_KAPSAMLARI = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
];

export function youtubeYapilandirildiMi(): boolean {
  return Boolean(
    optionalEnv("YOUTUBE_OAUTH_CLIENT_ID") && optionalEnv("YOUTUBE_OAUTH_CLIENT_SECRET") && optionalEnv("YOUTUBE_REFRESH_TOKEN")
  );
}

async function erisimTokeni(): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: optionalEnv("YOUTUBE_OAUTH_CLIENT_ID") ?? "",
      client_secret: optionalEnv("YOUTUBE_OAUTH_CLIENT_SECRET") ?? "",
      refresh_token: optionalEnv("YOUTUBE_REFRESH_TOKEN") ?? "",
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`[youtube] erişim token'ı alınamadı: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

export async function youtubeKanalBilgisi(): Promise<{ id: string; ad: string; videoSayisi: number }> {
  const token = await erisimTokeni();
  const res = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`[youtube] kanal bilgisi alınamadı: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const veri = (await res.json()) as {
    items?: { id: string; snippet: { title: string }; statistics: { videoCount: string } }[];
  };
  const kanal = veri.items?.[0];
  if (!kanal) throw new Error("[youtube] bu hesaba bağlı bir YouTube kanalı yok");
  return { id: kanal.id, ad: kanal.snippet.title, videoSayisi: Number(kanal.statistics.videoCount) };
}

/**
 * Videoyu Shorts olarak yükler (resumable upload, tek parça).
 * @returns { id, gizlilik } — gizlilik "private" dönerse proje henüz denetimden geçmemiştir.
 */
export async function postShortToYouTube(params: {
  baslik: string;
  aciklama: string;
  etiketler: string[];
  video: Buffer;
}): Promise<{ id: string; gizlilik: string } | null> {
  if (!youtubeYapilandirildiMi()) {
    console.warn("[youtube] OAuth yapılandırılmamış, Shorts yüklemesi atlandı");
    return null;
  }
  const token = await erisimTokeni();
  // Başlık en fazla 100 karakter; #Shorts etiketi keşfi kolaylaştırır.
  const ek = " #Shorts";
  const baslik = params.baslik.length + ek.length > 100 ? `${params.baslik.slice(0, 100 - ek.length - 1)}…${ek}` : `${params.baslik}${ek}`;

  const baslat = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": "video/mp4",
        "X-Upload-Content-Length": String(params.video.length),
      },
      body: JSON.stringify({
        snippet: {
          title: baslik,
          description: params.aciklama.slice(0, 4900),
          tags: params.etiketler.slice(0, 15),
          categoryId: "27", // Eğitim
          defaultLanguage: "tr",
          defaultAudioLanguage: "tr",
        },
        status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
      }),
    }
  );
  if (!baslat.ok) throw new Error(`[youtube] yükleme başlatılamadı: ${baslat.status} ${(await baslat.text()).slice(0, 300)}`);
  const yuklemeUrl = baslat.headers.get("location");
  if (!yuklemeUrl) throw new Error("[youtube] yükleme adresi dönmedi");

  const yukle = await fetch(yuklemeUrl, {
    method: "PUT",
    headers: { "Content-Type": "video/mp4", "Content-Length": String(params.video.length) },
    body: new Uint8Array(params.video),
  });
  if (!yukle.ok) throw new Error(`[youtube] video yüklenemedi: ${yukle.status} ${(await yukle.text()).slice(0, 300)}`);
  const sonuc = (await yukle.json()) as { id: string; status?: { privacyStatus?: string } };
  return { id: sonuc.id, gizlilik: sonuc.status?.privacyStatus ?? "bilinmiyor" };
}
