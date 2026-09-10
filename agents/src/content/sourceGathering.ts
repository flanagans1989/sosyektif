/**
 * Kaynak metin toplama — İçerik Ajanı'nın halüsinasyon riskini azaltmak için
 * (PLAN.md R2) LLM'e serbest üretim yerine gerçek bir kaynak metni verilir.
 *
 * Trend nereden gelirse gelsin (Google Trends, haber, YouTube...) evrensel
 * bir gerçek kaynağı olarak Wikipedia TR kullanılır: konu başlığıyla
 * doğrudan özet aranır, bulunamazsa Wikipedia arama API'siyle en yakın
 * maddeye düşülür. İkisi de başarısız olursa null döner — bu durumda
 * İçerik Ajanı o konuyu atlar (kaynaksız içerik üretmez).
 */

interface WikipediaSummary {
  title: string;
  extract: string;
  content_urls?: { desktop?: { page?: string } };
}

interface WikipediaSearchResponse {
  query?: { search?: { title: string }[] };
}

export interface GatheredSource {
  baslik: string;
  ozetMetni: string;
  url: string;
}

async function fetchSummary(title: string): Promise<WikipediaSummary | null> {
  const res = await fetch(
    `https://tr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
    { headers: { "User-Agent": "sosyektif-bot/0.1 (https://sosyektif.com)" } }
  );
  if (!res.ok) return null;
  const data = (await res.json()) as WikipediaSummary;
  if (!data.extract || data.extract.length < 40) return null;
  return data;
}

async function searchWikipedia(query: string): Promise<string | null> {
  const url = new URL("https://tr.wikipedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("list", "search");
  url.searchParams.set("srsearch", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("srlimit", "1");

  const res = await fetch(url, {
    headers: { "User-Agent": "sosyektif-bot/0.1 (https://sosyektif.com)" },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as WikipediaSearchResponse;
  return data.query?.search?.[0]?.title ?? null;
}

export async function gatherSourceFor(topicTitle: string): Promise<GatheredSource | null> {
  let summary = await fetchSummary(topicTitle);

  if (!summary) {
    const bestMatch = await searchWikipedia(topicTitle);
    if (bestMatch) summary = await fetchSummary(bestMatch);
  }

  if (!summary) return null;

  return {
    baslik: summary.title,
    ozetMetni: summary.extract,
    url:
      summary.content_urls?.desktop?.page ??
      `https://tr.wikipedia.org/wiki/${encodeURIComponent(summary.title)}`,
  };
}
