/**
 * Facebook Sayfası paylaşımı (PLAN.md Bölüm 11.2). Threads/Instagram'ın
 * aksine Facebook tıklanabilir link + fotoğraf albümünü aynı anda destekler,
 * bu yüzden hem carousel görselleri hem de gerçek URL paylaşılır. Token
 * yoksa/süresi dolmuşsa sessizce atlanır (R5 deseni, bkz. threads.ts).
 */
import { getMetaToken } from "./metaToken.js";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

/** Sayfanın son gönderilerinde aynı metinli olanı arar (`kaynak`: "posts" ya da "videos").
 * Aynı içerik iki kez paylaşılmasın diye paylaşmadan önce ve hata sonrasında bakılır
 * (2026-09-18, akkoyunlular: iki eşzamanlı dağıtım çalışması aynı içeriği iki kez attı).
 * Bulunamazsa ya da liste okunamazsa `null` (okuma izni yoksa eski davranış). */
async function ayniGonderiVarMi(
  pageId: string,
  accessToken: string,
  metin: string,
  kaynak: "posts" | "videos"
): Promise<string | null> {
  const alan = kaynak === "posts" ? "message" : "description";
  try {
    const res = await fetch(
      `${GRAPH_BASE}/${pageId}/${kaynak}?` +
        new URLSearchParams({ fields: `id,${alan}${kaynak === "posts" ? ",status_type" : ""}`, limit: "30", access_token: accessToken })
    );
    if (!res.ok) {
      console.warn(`[facebook] son ${kaynak} okunamadı (${res.status}), yinelenen kontrolü atlandı`);
      return null;
    }
    const { data } = (await res.json()) as { data?: Record<string, string>[] };
    // Albüm/fotoğraf metni Reels videosununkiyle aynı: /posts'ta video gönderilerini sayma.
    return data?.find((g) => g[alan]?.trim() === metin.trim() && g.status_type !== "added_video")?.id ?? null;
  } catch (err) {
    console.warn("[facebook] yinelenen kontrolü başarısız:", err);
    return null;
  }
}

/** Paylaşım hata dönerse gönderinin gerçekte çıkıp çıkmadığına bakar; çıktıysa hata yutulur. */
async function hataSonrasiKontrol(
  pageId: string,
  accessToken: string,
  metin: string,
  kaynak: "posts" | "videos",
  hata: unknown
): Promise<string> {
  await new Promise((r) => setTimeout(r, 5000));
  const id = await ayniGonderiVarMi(pageId, accessToken, metin, kaynak);
  if (id) {
    console.warn(`[facebook] paylaşım hata döndü ama gönderi sayfada var (${id}), başarı sayıldı:`, hata);
    return id;
  }
  throw hata;
}

/** Tek bir görseli Sayfa albümüne yayınlanmamış (published=false) olarak yükler. */
async function fotoYukle(
  pageId: string,
  accessToken: string,
  imageUrl: string
): Promise<string> {
  const res = await fetch(
    `${GRAPH_BASE}/${pageId}/photos?` +
      new URLSearchParams({ url: imageUrl, published: "false", access_token: accessToken }),
    { method: "POST" }
  );
  if (!res.ok) {
    throw new Error(`[facebook] fotoğraf yüklenemedi: ${res.status} ${await res.text()}`);
  }
  const { id } = (await res.json()) as { id: string };
  return id;
}

/**
 * @param imageUrls Herkese açık görsel URL'leri (agents/src/image/social.ts ->
 *   writeCarouselSlides). Tek görselse doğrudan fotoğraflı gönderi, birden
 *   fazlaysa çoklu fotoğraf albümü olur.
 * @returns Yayınlanan gönderinin ID'si (sosyal performans ajanı için) —
 *   token yoksa `null`.
 */
export async function postToFacebook(message: string, imageUrls: string[]): Promise<string | null> {
  const token = await getMetaToken("facebook");
  const pageId = token?.page_id;
  if (!token || !pageId) {
    console.warn("[facebook] token/sayfa bilgisi yok, paylaşım atlandı");
    return null;
  }
  const { access_token } = token;

  const mevcut = await ayniGonderiVarMi(pageId, access_token, message, "posts");
  if (mevcut) {
    console.warn(`[facebook] aynı gönderi sayfada zaten var (${mevcut}), yeniden paylaşılmadı`);
    return mevcut;
  }
  return gonderiAt(pageId, access_token, message, imageUrls).catch((err) =>
    hataSonrasiKontrol(pageId, access_token, message, "posts", err)
  );
}

async function gonderiAt(pageId: string, access_token: string, message: string, imageUrls: string[]): Promise<string> {
  if (imageUrls.length === 0) {
    // Görsel yoksa da düz metin+link gönderisi at (Facebook bunu destekliyor,
    // Instagram'dan farklı olarak).
    const res = await fetch(
      `${GRAPH_BASE}/${pageId}/feed?` +
        new URLSearchParams({ message, access_token }),
      { method: "POST" }
    );
    if (!res.ok) {
      throw new Error(`[facebook] gönderi paylaşılamadı: ${res.status} ${await res.text()}`);
    }
    const { id } = (await res.json()) as { id: string };
    return id;
  }

  if (imageUrls.length === 1) {
    const res = await fetch(
      `${GRAPH_BASE}/${pageId}/photos?` +
        new URLSearchParams({
          url: imageUrls[0]!,
          caption: message,
          access_token,
        }),
      { method: "POST" }
    );
    if (!res.ok) {
      throw new Error(`[facebook] fotoğraf paylaşılamadı: ${res.status} ${await res.text()}`);
    }
    const { post_id, id } = (await res.json()) as { post_id?: string; id: string };
    return post_id ?? id;
  }

  // Çoklu görsel: önce her birini yayınlanmamış olarak yükle, sonra tek bir
  // /feed gönderisinde attached_media ile birleştir (albüm gibi görünür).
  const medyaIdleri: string[] = [];
  for (const url of imageUrls) {
    const id = await fotoYukle(pageId, access_token, url);
    medyaIdleri.push(id);
  }

  const gorunurMedya = medyaIdleri.map((id) => JSON.stringify({ media_fbid: id }));
  const params = new URLSearchParams({ message, access_token });
  gorunurMedya.forEach((json, i) => params.append(`attached_media[${i}]`, json));

  const res = await fetch(`${GRAPH_BASE}/${pageId}/feed?` + params, { method: "POST" });
  if (!res.ok) {
    throw new Error(`[facebook] albüm paylaşılamadı: ${res.status} ${await res.text()}`);
  }
  const { id } = (await res.json()) as { id: string };
  return id;
}

/**
 * Facebook Sayfası video paylaşımı (Reels'e Facebook'ta karşılık gelen
 * biçim). instagram.ts'teki postReelToInstagram ile aynı video dosyasını
 * kullanır. Facebook'un video yükleme uç noktası dosya URL'ini kendi çekip
 * işliyor — Threads/Instagram'daki gibi ayrı bir "container hazır mı" polling
 * adımı gerekmiyor, `/videos` çağrısı doğrudan post ID döner.
 * @param videoUrl Herkese açık .mp4 URL'i (agents/src/image/reelRender.ts).
 * @returns Yayınlanan videonun ID'si — token yoksa `null`.
 */
export async function postVideoToFacebook(description: string, videoUrl: string): Promise<string | null> {
  const token = await getMetaToken("facebook");
  const pageId = token?.page_id;
  if (!token || !pageId) {
    console.warn("[facebook] token/sayfa bilgisi yok, video paylaşımı atlandı");
    return null;
  }
  const { access_token } = token;

  const mevcut = await ayniGonderiVarMi(pageId, access_token, description, "videos");
  if (mevcut) {
    console.warn(`[facebook] aynı video sayfada zaten var (${mevcut}), yeniden paylaşılmadı`);
    return mevcut;
  }

  const res = await fetch(
    `${GRAPH_BASE}/${pageId}/videos?` +
      new URLSearchParams({ file_url: videoUrl, description, access_token }),
    { method: "POST" }
  );
  if (!res.ok) {
    throw new Error(`[facebook] video paylaşılamadı: ${res.status} ${await res.text()}`);
  }
  const { id } = (await res.json()) as { id: string };
  return id;
}
