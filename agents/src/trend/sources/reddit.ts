import Parser from "rss-parser";
import type { TrendCandidate } from "../../lib/schemas.js";

const parser = new Parser();

const SUBREDDITLER = ["todayilearned", "türkiye", "all"];

/**
 * Reddit public RSS — API key/OAuth gerektirmez, Haziran 2026 Responsible
 * Builder Policy'sinin onay sürecine takılmaz. ANCAK bulut IP'lerinden
 * (GitHub Actions dahil) sık sık 403 dönebiliyor (PLAN.md R7) — bu yüzden
 * bu kaynak "en iyi çaba" olarak ele alınır: hata durumunda sessizce boş
 * dizi döner, pipeline'ı durdurmaz.
 */
export async function fetchRedditTrending(): Promise<TrendCandidate[]> {
  const sonuclar: TrendCandidate[] = [];

  for (const subreddit of SUBREDDITLER) {
    try {
      const feed = await parser.parseURL(
        `https://www.reddit.com/r/${subreddit}/top/.rss?limit=10&t=day`
      );
      for (const item of feed.items ?? []) {
        if (!item.title) continue;
        sonuclar.push({
          baslik: item.title,
          kaynak: "reddit" as const,
          url: item.link,
          tahminiIlgi: 0.4,
        });
      }
    } catch (err) {
      console.warn(
        `[trend/reddit] r/${subreddit} alınamadı (en iyi çaba kaynağı, atlanıyor):`,
        err instanceof Error ? err.message : err
      );
    }
  }

  return sonuclar;
}
