import Parser from "rss-parser";
import type { TrendCandidate } from "../../lib/schemas.js";

type GoogleTrendsItem = {
  title: string;
  "ht:approx_traffic"?: string;
};

const parser: Parser<Record<string, unknown>, GoogleTrendsItem> = new Parser({
  customFields: {
    item: ["ht:approx_traffic"],
  },
});

/**
 * Google Trends TR günlük trend RSS'i. Auth gerektirmez.
 * PLAN.md'de doğrulandı: her item traffic tahmini + ilişkili haberler içeriyor.
 */
export async function fetchGoogleTrends(): Promise<TrendCandidate[]> {
  const feed = await parser.parseURL("https://trends.google.com/trending/rss?geo=TR");

  return (feed.items ?? []).map((item) => {
    const traffic = item["ht:approx_traffic"];
    const trafficNumber = traffic ? Number(traffic.replace(/[^0-9]/g, "")) : 0;
    // 500.000+ arama -> ~1.0, 10.000 altı -> ~0.1 arası kaba normalize.
    const tahminiIlgi = Math.min(1, Math.max(0.1, trafficNumber / 500_000));

    return {
      baslik: item.title ?? "",
      kaynak: "google-trends" as const,
      url: item.link,
      tahminiIlgi,
    };
  }).filter((c) => c.baslik.length > 0);
}
