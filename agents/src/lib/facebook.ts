/**
 * Facebook Sayfası paylaşımı (PLAN.md Bölüm 11.2). Threads/Instagram'ın
 * aksine Facebook tıklanabilir link + fotoğraf albümünü aynı anda destekler,
 * bu yüzden hem carousel görselleri hem de gerçek URL paylaşılır. Token
 * yoksa/süresi dolmuşsa sessizce atlanır (R5 deseni, bkz. threads.ts).
 */
import { getMetaToken } from "./metaToken.js";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

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
