/**
 * Instagram paylaşımı (PLAN.md Bölüm 11.2). Instagram metin-only paylaşım
 * desteklemediği için carousel görselleri kullanılır (agents/src/image/social.ts).
 * Token yoksa/süresi dolmuşsa sessizce atlanır (R5 deseni).
 */
import { getMetaToken } from "./metaToken.js";

const GRAPH_BASE = "https://graph.instagram.com/v21.0";

async function containerOlustur(
  igUserId: string,
  accessToken: string,
  params: Record<string, string>
): Promise<string> {
  // Not: GET ile çağrıldığında Graph API "media_publish"i "media" üzerinde
  // var olmayan bir alan sanıp hata veriyor — POST şart (2026-09-12'de
  // gerçek token ile doğrulandı, bkz. threads.ts'teki aynı düzeltme).
  const res = await fetch(
    `${GRAPH_BASE}/${igUserId}/media?` + new URLSearchParams({ ...params, access_token: accessToken }),
    { method: "POST" }
  );
  if (!res.ok) {
    throw new Error(`[instagram] container oluşturulamadı: ${res.status} ${await res.text()}`);
  }
  const { id } = (await res.json()) as { id: string };
  return id;
}

async function yayinla(igUserId: string, accessToken: string, creationId: string): Promise<string> {
  const res = await fetch(
    `${GRAPH_BASE}/${igUserId}/media_publish?` +
      new URLSearchParams({ creation_id: creationId, access_token: accessToken }),
    { method: "POST" }
  );
  if (!res.ok) {
    throw new Error(`[instagram] yayınlanamadı: ${res.status} ${await res.text()}`);
  }
  const { id } = (await res.json()) as { id: string };
  return id;
}

function bekle(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Video (Reels) container'ı arka planda işleniyor — threads.ts'teki aynı
 * desen. Fotoğraf container'ları genelde anında hazır, video ise dakikalar
 * sürebilir; FINISHED olmadan yayınlamak hata veriyor. */
async function videoHazirOlanaKadarBekle(containerId: string, accessToken: string): Promise<void> {
  for (let deneme = 0; deneme < 20; deneme++) {
    await bekle(5000);
    const res = await fetch(
      `${GRAPH_BASE}/${containerId}?` +
        new URLSearchParams({ fields: "status_code", access_token: accessToken })
    );
    if (!res.ok) continue;
    const { status_code } = (await res.json()) as { status_code?: string };
    if (status_code === "FINISHED") return;
    if (status_code === "ERROR") throw new Error("[instagram] video container işlenirken hata oluştu");
  }
  // Zaman aşımı (~100sn) — yine de yayınlamayı dene.
}

/**
 * @param imageUrls Herkese açık, sırayla gösterilecek görsel URL'leri
 *   (agents/src/image/social.ts -> writeCarouselSlides). Tek görselse
 *   normal tek fotoğraf gönderisi, birden fazlaysa carousel olur.
 * @returns Yayınlanan gönderinin media ID'si (sosyal performans ajanı için) —
 *   token/görsel yoksa `null`.
 */
export async function postToInstagram(caption: string, imageUrls: string[]): Promise<string | null> {
  const token = await getMetaToken("instagram");
  const ig_user_id = token?.ig_user_id;
  if (!token || !ig_user_id) {
    console.warn("[instagram] token/hesap bilgisi yok, paylaşım atlandı");
    return null;
  }
  if (imageUrls.length === 0) {
    console.warn("[instagram] görsel yok, paylaşım atlandı");
    return null;
  }

  const { access_token } = token;

  if (imageUrls.length === 1) {
    const containerId = await containerOlustur(ig_user_id, access_token, {
      image_url: imageUrls[0]!,
      caption,
    });
    return yayinla(ig_user_id, access_token, containerId);
  }

  // Carousel: en fazla 10 alt öğe (Instagram sınırı — image/social.ts zaten bu sınırı uyguluyor).
  const altOgeIdleri: string[] = [];
  for (const url of imageUrls) {
    const id = await containerOlustur(ig_user_id, access_token, {
      image_url: url,
      is_carousel_item: "true",
    });
    altOgeIdleri.push(id);
  }

  const carouselId = await containerOlustur(ig_user_id, access_token, {
    media_type: "CAROUSEL",
    children: altOgeIdleri.join(","),
    caption,
  });
  return yayinla(ig_user_id, access_token, carouselId);
}

/**
 * Reels (dikey video) paylaşımı — carousel'e göre çok daha yüksek erişim
 * alıyor (Instagram algoritması feed carousel'i geriye itiyor). Video
 * container'ı fotoğraftan farklı olarak arka planda işleniyor, bu yüzden
 * FINISHED olana kadar poll ediliyor (bkz. videoHazirOlanaKadarBekle).
 * @param videoUrl Herkese açık .mp4 URL'i (agents/src/image/reelRender.ts).
 * @returns Yayınlanan Reels'in media ID'si — token/kurulum eksikse `null`.
 */
export async function postReelToInstagram(caption: string, videoUrl: string): Promise<string | null> {
  const token = await getMetaToken("instagram");
  const ig_user_id = token?.ig_user_id;
  if (!token || !ig_user_id) {
    console.warn("[instagram] token/hesap bilgisi yok, reels paylaşımı atlandı");
    return null;
  }
  const { access_token } = token;

  const containerId = await containerOlustur(ig_user_id, access_token, {
    media_type: "REELS",
    video_url: videoUrl,
    caption,
  });
  await videoHazirOlanaKadarBekle(containerId, access_token);
  return yayinla(ig_user_id, access_token, containerId);
}
