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
 * Dünün en çok okunan TR Wikipedia maddelerini döner (bugünün verisi
 * henüz hazır olmadığı için bir gün öncesi kullanılır).
 *
 * Not: Sonuçlar arasında "Özel:Ara" gibi navigasyon sayfaları ve +18
 * film/dizi maddeleri çıkabilir (PLAN.md R6) — filtreleme Trend
 * Ajanı'nın ana filtre zincirinde (kural + LLM) yapılır, burada sadece
 * bariz sistem sayfaları elenir.
 */
export async function fetchWikipediaTrending(): Promise<TrendCandidate[]> {
  const dun = new Date();
  dun.setDate(dun.getDate() - 1);
  const yil = dun.getFullYear();
  const ay = String(dun.getMonth() + 1).padStart(2, "0");
  const gun = String(dun.getDate()).padStart(2, "0");

  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/tr.wikipedia/all-access/${yil}/${ay}/${gun}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "sosyektif-bot/0.1 (https://sosyektif.com)" },
  });

  if (!res.ok) {
    throw new Error(`wikipedia pageviews ${res.status}`);
  }

  const data = (await res.json()) as WikimediaPageviewsResponse;
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
