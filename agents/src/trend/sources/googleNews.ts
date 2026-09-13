import Parser from "rss-parser";
import type { TrendCandidate } from "../../lib/schemas.js";

const parser = new Parser();

/**
 * Google News RSS — kategori bazlı sabit "topic" ID'leri belgelenmemiş ve
 * kırılgan olduğu için bunun yerine arama sorgusu (search) uç noktası
 * kullanılıyor: bu, Google'ın resmi olarak desteklediği ve stabil kalan
 * bir RSS formatı.
 */
const KATEGORI_SORGULARI: Record<string, string> = {
  eglence: "eğlence",
  bilim: "bilim",
  teknoloji: "teknoloji",
  spor: "spor",
  ekonomi: "ekonomi",
};

export async function fetchGoogleNews(kategori?: string): Promise<TrendCandidate[]> {
  const sorgu = kategori ? KATEGORI_SORGULARI[kategori] : undefined;
  const url = sorgu
    ? `https://news.google.com/rss/search?q=${encodeURIComponent(sorgu)}&hl=tr&gl=TR&ceid=TR:tr`
    : `https://news.google.com/rss?hl=tr&gl=TR&ceid=TR:tr`;

  const feed = await parser.parseURL(url);

  return (feed.items ?? [])
    .slice(0, 25)
    .map((item) => ({
      baslik: (item.title ?? "").replace(/ - [^-]+$/, "").trim(), // kaynak adı sonekini kırp
      kaynak: "google-news" as const,
      url: item.link,
      tahminiIlgi: 0.5,
      kategoriTahmini: kategori as TrendCandidate["kategoriTahmini"],
    }))
    .filter((c) => c.baslik.length > 0);
}
