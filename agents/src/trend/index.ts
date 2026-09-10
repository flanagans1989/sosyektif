import { fetchGoogleTrends } from "./sources/googleTrends.js";
import { fetchWikipediaTrending } from "./sources/wikipedia.js";
import { fetchGoogleNews } from "./sources/googleNews.js";
import { fetchYouTubeTrending } from "./sources/youtube.js";
import { fetchRedditTrending } from "./sources/reddit.js";
import { isNavigationNoise, checkBlocklist } from "../lib/blocklist.js";
import { readEvergreen, konuDahaOnceIslendiMi } from "../lib/state.js";
import type { TrendCandidate } from "../lib/schemas.js";

/** Kaynak başarısız olursa (Reddit 403 gibi, PLAN.md R7) sessizce boş döner. */
async function safeGather(
  isim: string,
  fn: () => Promise<TrendCandidate[]>
): Promise<TrendCandidate[]> {
  try {
    return await fn();
  } catch (err) {
    console.warn(`[trend] ${isim} kaynağı başarısız, atlanıyor:`, err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Tüm kaynaklardan konu adayı toplar, kural tabanlı filtreden geçirir
 * (navigasyon gürültüsü + kara liste + tekrar kontrolü) ve evergreen
 * havuzuyla karıştırıp ilgi skoruna göre sıralar.
 *
 * LLM tabanlı ikinci filtre (değer/kategori/hassasiyet sınıflandırması)
 * bilerek burada değil, İçerik Ajanı'nda -- yalnızca gerçekten işlenecek
 * adaylar için -- yapılır; böylece gereksiz LLM çağrısı yapılmaz.
 */
/**
 * Google News'in KATEGORİSİZ genel akışı denendi ve gerçek testte doğrulandı:
 * doğrudan siyaset/suç ağırlıklı gündem manşetleri getiriyor ("...öldü",
 * "silahlı tehdit", parti/bakan haberleri) — kara liste anahtar kelimeleri
 * bunların çoğunu birebir yakalayamıyor çünkü başlıklar yasak kelimeyi
 * içermiyor. Bu yüzden genel akış HİÇ kullanılmıyor; sadece güvenli,
 * kategori bazlı sorgular çekiliyor (PLAN.md R3, R6).
 */
const GUVENLI_HABER_KATEGORILERI = ["eglence", "bilim", "teknoloji", "spor"] as const;

export async function gatherTrendCandidates(): Promise<TrendCandidate[]> {
  const [google, wikipedia, newsPerKategori, youtube, reddit] = await Promise.all([
    safeGather("google-trends", fetchGoogleTrends),
    safeGather("wikipedia", fetchWikipediaTrending),
    Promise.all(
      GUVENLI_HABER_KATEGORILERI.map((kategori) =>
        safeGather(`google-news/${kategori}`, () => fetchGoogleNews(kategori))
      )
    ),
    safeGather("youtube", fetchYouTubeTrending),
    safeGather("reddit", fetchRedditTrending),
  ]);

  const news = newsPerKategori.flat();
  const hamAdaylar = [...google, ...wikipedia, ...news, ...youtube, ...reddit];

  const filtrelenmis: TrendCandidate[] = [];
  for (const aday of hamAdaylar) {
    if (await isNavigationNoise(aday.baslik)) continue;
    const blocklistSonucu = await checkBlocklist(aday.baslik);
    if (blocklistSonucu.ihlalVar) continue;
    if (await konuDahaOnceIslendiMi(aday.baslik)) continue;
    filtrelenmis.push(aday);
  }

  // Evergreen havuzundan kullanılmamış konuları ekle (~%40 karışım hedefi, PLAN.md 3.1)
  const evergreen = await readEvergreen();
  const kullanilmamisEvergreen = evergreen
    .filter((t) => !t.kullanildi)
    .map<TrendCandidate>((t) => ({
      baslik: t.baslik,
      kaynak: "evergreen" as const,
      tahminiIlgi: 0.3,
      kategoriTahmini: t.kategori as TrendCandidate["kategoriTahmini"],
      formatOnerisi: t.formatOnerisi,
    }));

  const hedefEvergreenSayisi = Math.ceil(filtrelenmis.length * 0.4);
  const evergreenKarisim = kullanilmamisEvergreen.slice(0, hedefEvergreenSayisi);

  return [...filtrelenmis, ...evergreenKarisim].sort(
    (a, b) => b.tahminiIlgi - a.tahminiIlgi
  );
}
