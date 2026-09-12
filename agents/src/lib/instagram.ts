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

async function yayinla(igUserId: string, accessToken: string, creationId: string): Promise<void> {
  const res = await fetch(
    `${GRAPH_BASE}/${igUserId}/media_publish?` +
      new URLSearchParams({ creation_id: creationId, access_token: accessToken }),
    { method: "POST" }
  );
  if (!res.ok) {
    throw new Error(`[instagram] yayınlanamadı: ${res.status} ${await res.text()}`);
  }
}

/**
 * @param imageUrls Herkese açık, sırayla gösterilecek görsel URL'leri
 *   (agents/src/image/social.ts -> writeCarouselSlides). Tek görselse
 *   normal tek fotoğraf gönderisi, birden fazlaysa carousel olur.
 */
export async function postToInstagram(caption: string, imageUrls: string[]): Promise<void> {
  const token = await getMetaToken("instagram");
  const ig_user_id = token?.ig_user_id;
  if (!token || !ig_user_id) {
    console.warn("[instagram] token/hesap bilgisi yok, paylaşım atlandı");
    return;
  }
  if (imageUrls.length === 0) {
    console.warn("[instagram] görsel yok, paylaşım atlandı");
    return;
  }

  const { access_token } = token;

  if (imageUrls.length === 1) {
    const containerId = await containerOlustur(ig_user_id, access_token, {
      image_url: imageUrls[0]!,
      caption,
    });
    await yayinla(ig_user_id, access_token, containerId);
    return;
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
  await yayinla(ig_user_id, access_token, carouselId);
}
