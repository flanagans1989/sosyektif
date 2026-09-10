import type { TrendCandidate } from "../../lib/schemas.js";

interface WikimediaPageviewsResponse {
  items: {
    articles: { article: string; views: number }[];
  }[];
}

const OZEL_SAYFA_ONEKLERI = [
  "Özel:",
  "Kategori:",
  "Anasayfa",
  "Vikipedi:",
  "Şablon:",
  "Dosya:",
  "Yardım:",
  "Konuşma:",
];

function isOzelSayfa(article: string): boolean {
  return OZEL_SAYFA_ONEKLERI.some((prefix) => article.startsWith(prefix));
}

/**
 * Wikimedia Pageviews API — resmi, ücretsiz, auth gerektirmez.
 * En çok okunan TR Wikipedia maddelerini döner.
 *
 * Not: Sonuçlar arasında "Özel:Ara" gibi navigasyon sayfaları ve +18
 * film/dizi maddeleri çıkabilir (PLAN.md R6) — filtreleme Trend
 * Ajanı'nın ana filtre zincirinde (kural + LLM) yapılır, burada sadece
 * bariz sistem sayfaları elenir.
 */
export async function fetchWikipediaTrending(): Promise<TrendCandidate[]> {
  // Wikimedia'nın günlük top-pageviews verisi bazen "dün" için henüz hazır
  // olmuyor (gördüğümüz gerçek hata: dün için 404). Veri genelde 1-2 gün
  // gecikmeli yayınlanıyor, bu yüzden 1'den 3 güne kadar geriye doğru
  // dener, ilk başarılı olanı kullanır.
  let sonHata: unknown;
  for (let gunOncesi = 1; gunOncesi <= 3; gunOncesi++) {
    const tarih = new Date();
    tarih.setDate(tarih.getDate() - gunOncesi);
    const yil = tarih.getFullYear();
    const ay = String(tarih.getMonth() + 1).padStart(2, "0");
    const gun = String(tarih.getDate()).padStart(2, "0");

    const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/tr.wikipedia/all-access/${yil}/${ay}/${gun}`;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "sosyektif-bot/0.1 (https://sosyektif.com)" },
      });
      if (!res.ok) {
        sonHata = new Error(`wikipedia pageviews ${res.status} (${yil}-${ay}-${gun})`);
        continue;
      }
      return parseWikipediaTrending((await res.json()) as WikimediaPageviewsResponse);
    } catch (err) {
      sonHata = err;
    }
  }
  throw sonHata ?? new Error("wikipedia pageviews: bilinmeyen hata");
}

function parseWikipediaTrending(data: WikimediaPageviewsResponse): TrendCandidate[] {
  const articles = data.items[0]?.articles ?? [];
  const maxViews = Math.max(...articles.map((a) => a.views), 1);

  return articles
    .filter((a) => !isOzelSayfa(a.article))
    .slice(0, 30)
    .map((a) => ({
      baslik: a.article.replace(/_/g, " "),
      kaynak: "wikipedia" as const,
      url: `https://tr.wikipedia.org/wiki/${a.article}`,
      tahminiIlgi: a.views / maxViews,
    }));
}
