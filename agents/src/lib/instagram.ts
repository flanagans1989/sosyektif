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

/** Container'lar arka planda işleniyor — threads.ts'teki aynı desen. FINISHED
 * olmadan yayınlamak hata veriyor. Video dakikalar sürebilir; fotoğraf/carousel
 * genelde saniyeler içinde hazır ama "anında" değil: 2026-09-13'te ilk gerçek
 * carousel paylaşımı "Media ID is not available" hatası verdi. */
async function containerHazirOlanaKadarBekle(containerId: string, accessToken: string, aralikMs = 5000): Promise<void> {
  for (let deneme = 0; deneme < 20; deneme++) {
    await bekle(aralikMs);
    const res = await fetch(
      `${GRAPH_BASE}/${containerId}?` +
        new URLSearchParams({ fields: "status_code", access_token: accessToken })
    );
    if (!res.ok) continue;
    const { status_code } = (await res.json()) as { status_code?: string };
    if (status_code === "FINISHED") return;
    if (status_code === "ERROR") throw new Error("[instagram] container işlenirken hata oluştu");
  }
  // Zaman aşımı — yine de yayınlamayı dene.
}

/** Hesabın son gönderilerinde aynı caption'lı gönderiyi arar. Graph API bazen
 * `media_publish` için hata (403/zaman aşımı) dönerken gönderiyi yine de yayınlıyor;
 * kuyruk hatayı görüp saatlik yeniden denediği için aynı içerik defalarca çıkıyordu
 * (2026-09-19, Engin Ayça). Bulunamazsa ya da liste okunamazsa `null`. */
async function ayniGonderiVarMi(igUserId: string, accessToken: string, caption: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${GRAPH_BASE}/${igUserId}/media?` +
        new URLSearchParams({ fields: "id,caption", limit: "30", access_token: accessToken })
    );
    if (!res.ok) {
      console.warn(`[instagram] son gönderiler okunamadı (${res.status}), yinelenen kontrolü atlandı`);
      return null;
    }
    const { data } = (await res.json()) as { data?: { id: string; caption?: string }[] };
    return data?.find((m) => m.caption?.trim() === caption.trim())?.id ?? null;
  } catch (err) {
    console.warn("[instagram] yinelenen kontrolü başarısız:", err);
    return null;
  }
}

/** Yayın hatasında gönderinin gerçekte çıkıp çıkmadığına bakar; çıktıysa hata yutulur. */
async function hataSonrasiKontrol(igUserId: string, accessToken: string, caption: string, hata: unknown): Promise<string> {
  await bekle(5000);
  const id = await ayniGonderiVarMi(igUserId, accessToken, caption);
  if (id) {
    console.warn(`[instagram] yayın hata döndü ama gönderi hesapta var (${id}), başarı sayıldı:`, hata);
    return id;
  }
  throw hata;
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

  // Zaten yayınlanmışsa (önceki deneme hata dönse de çıkmış olabilir) tekrar paylaşma.
  const mevcut = await ayniGonderiVarMi(ig_user_id, access_token, caption);
  if (mevcut) {
    console.warn(`[instagram] aynı gönderi hesapta zaten var (${mevcut}), yeniden paylaşılmadı`);
    return mevcut;
  }

  if (imageUrls.length === 1) {
    const containerId = await containerOlustur(ig_user_id, access_token, {
      image_url: imageUrls[0]!,
      caption,
    });
    await containerHazirOlanaKadarBekle(containerId, access_token, 2000);
    return yayinla(ig_user_id, access_token, containerId).catch((err) =>
      hataSonrasiKontrol(ig_user_id, access_token, caption, err)
    );
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
  await containerHazirOlanaKadarBekle(carouselId, access_token, 2000);
  return yayinla(ig_user_id, access_token, carouselId).catch((err) =>
    hataSonrasiKontrol(ig_user_id, access_token, caption, err)
  );
}

/**
 * Reels (dikey video) paylaşımı — carousel'e göre çok daha yüksek erişim
 * alıyor (Instagram algoritması feed carousel'i geriye itiyor). Video
 * container'ı fotoğraftan farklı olarak arka planda işleniyor, bu yüzden
 * FINISHED olana kadar poll ediliyor (bkz. containerHazirOlanaKadarBekle).
 * @param videoUrl Herkese açık .mp4 URL'i (agents/src/image/reelRender.ts).
 * @param kapakMs Kapak olarak kullanılacak videodaki an (`thumb_offset`). Verilmezse
 *   Instagram ilk kareyi alır — bizim videolarda o kare siyah.
 * @returns Yayınlanan Reels'in media ID'si — token/kurulum eksikse `null`.
 */
export async function postReelToInstagram(caption: string, videoUrl: string, kapakMs?: number): Promise<string | null> {
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
    ...(kapakMs !== undefined ? { thumb_offset: String(Math.round(kapakMs)) } : {}),
  });
  await containerHazirOlanaKadarBekle(containerId, access_token);
  return yayinla(ig_user_id, access_token, containerId);
}
