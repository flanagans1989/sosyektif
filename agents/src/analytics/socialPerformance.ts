/**
 * Sosyal performans ajanı (PLAN.md Bölüm 11.6, "format ağırlığı ve tepki
 * barı verisi" maddesi): Threads/Instagram/Facebook'ta hangi paylaşımın
 * etkileşim aldığını ölçüp `category-weights.json`'a küçük bir sinyal
 * olarak ekler. `analytics/index.ts`'teki (Cloudflare/Search Console)
 * ağırlıklandırmadan ayrı ve ONDAN SONRA çalışır — üstüne yumuşak bir
 * çarpan uygular, üzerine yazmaz.
 *
 * Threads için etkileşim ölçülmüyor: `threads_manage_insights` izni
 * uygulamaya tanımlı değil (bootstrap'ta yalnızca `threads_basic` +
 * `threads_content_publish` alındı) — eklemek Facebook'takine benzer bir
 * App Dashboard/kullanım durumu adımı gerektirir, şimdilik R5 deseniyle
 * sessizce atlanıyor (mevcut token yeterli olmadığı için `insufficient
 * permissions` hatası bekleniyor, bu normal).
 */
import { readPublishedIndex, readCategoryWeights, writeCategoryWeights } from "../lib/state.js";
import { getMetaToken } from "../lib/metaToken.js";

export interface PostEngagement {
  slug: string;
  kategori: string;
  format: string;
  /** Ağırlıklı etkileşim puanı: beğeni + yorum×2 + paylaşım×3 (yorum/paylaşım
   * daha güçlü ilgi sinyali sayılır). */
  toplam: number;
}

async function instagramEtkilesimi(mediaId: string, accessToken: string): Promise<number> {
  try {
    const res = await fetch(
      `https://graph.instagram.com/v21.0/${mediaId}?` +
        new URLSearchParams({ fields: "like_count,comments_count", access_token: accessToken })
    );
    if (!res.ok) return 0;
    const { like_count = 0, comments_count = 0 } = (await res.json()) as {
      like_count?: number;
      comments_count?: number;
    };
    return like_count + comments_count * 2;
  } catch (err) {
    console.warn("[sosyal-performans] instagram etkileşimi okunamadı:", err);
    return 0;
  }
}

async function facebookEtkilesimi(postId: string, accessToken: string): Promise<number> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${postId}?` +
        new URLSearchParams({
          fields: "likes.summary(true),comments.summary(true),shares",
          access_token: accessToken,
        })
    );
    if (!res.ok) return 0;
    const veri = (await res.json()) as {
      likes?: { summary?: { total_count?: number } };
      comments?: { summary?: { total_count?: number } };
      shares?: { count?: number };
    };
    const begeni = veri.likes?.summary?.total_count ?? 0;
    const yorum = veri.comments?.summary?.total_count ?? 0;
    const paylasim = veri.shares?.count ?? 0;
    return begeni + yorum * 2 + paylasim * 3;
  } catch (err) {
    console.warn("[sosyal-performans] facebook etkileşimi okunamadı:", err);
    return 0;
  }
}

/** Son `gunSayisi` günde sosyal paylaşımı olan her içerik için etkileşim toplar. */
export async function fetchSocialEngagement(gunSayisi = 14): Promise<PostEngagement[]> {
  const index = await readPublishedIndex();
  const kesim = Date.now() - gunSayisi * 24 * 60 * 60 * 1000;
  const adaylar = index.filter(
    (e) => e.sosyalPaylasimlar && new Date(e.yayinTarihi).getTime() >= kesim
  );
  if (adaylar.length === 0) return [];

  const [instagramToken, facebookToken] = await Promise.all([
    getMetaToken("instagram"),
    getMetaToken("facebook"),
  ]);

  const sonuclar: PostEngagement[] = [];
  for (const entry of adaylar) {
    let toplam = 0;
    const igId = entry.sosyalPaylasimlar?.instagram;
    const fbId = entry.sosyalPaylasimlar?.facebook;
    if (igId && instagramToken) toplam += await instagramEtkilesimi(igId, instagramToken.access_token);
    if (fbId && facebookToken) toplam += await facebookEtkilesimi(fbId, facebookToken.access_token);
    sonuclar.push({ slug: entry.slug, kategori: entry.kategori, format: entry.format, toplam });
  }
  return sonuclar;
}

/**
 * category-weights.json'a sosyal etkileşimi yumuşak bir çarpan olarak
 * ekler: ortalamanın üzerindeki kategoriler ±%10-15 içinde hafifçe
 * yükselir, altındakiler hafifçe düşer. `analytics/index.ts`'teki gibi
 * taban her zaman 0.5 — hiçbir kategori tamamen elenmez.
 */
export async function nudgeCategoryWeightsBySocial(
  engagements: PostEngagement[]
): Promise<Record<string, number>> {
  const mevcut = await readCategoryWeights();
  if (engagements.length === 0) return mevcut;

  const kategoriToplam: Record<string, number> = {};
  for (const e of engagements) kategoriToplam[e.kategori] = (kategoriToplam[e.kategori] ?? 0) + e.toplam;

  const degerler = Object.values(kategoriToplam);
  const genelOrtalama = degerler.reduce((a, b) => a + b, 0) / Math.max(1, degerler.length);
  if (genelOrtalama === 0) return mevcut; // hiç etkileşim yok (token eksik/yeni hesap) — dokunma

  const guncellenmis = { ...mevcut };
  for (const [kategori, toplam] of Object.entries(kategoriToplam)) {
    const oran = toplam / genelOrtalama;
    const carpan = Math.min(1.15, Math.max(0.9, 0.9 + oran * 0.1));
    guncellenmis[kategori] = Math.max(0.5, (guncellenmis[kategori] ?? 1) * carpan);
  }
  await writeCategoryWeights(guncellenmis);
  return guncellenmis;
}
