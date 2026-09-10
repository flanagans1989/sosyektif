import { optionalEnv } from "../../lib/env.js";
import type { TrendCandidate } from "../../lib/schemas.js";

interface YouTubeVideosResponse {
  items: { id: string; snippet: { title: string } }[];
}

/** YouTube Data API v3 — TR trend videoları. Ücretsiz kota: 10.000 birim/gün, bu çağrı 1 birim. */
export async function fetchYouTubeTrending(): Promise<TrendCandidate[]> {
  const apiKey = optionalEnv("YOUTUBE_API_KEY");
  if (!apiKey) {
    console.warn("[trend/youtube] YOUTUBE_API_KEY yok, atlanıyor");
    return [];
  }

  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("chart", "mostPopular");
  url.searchParams.set("regionCode", "TR");
  url.searchParams.set("maxResults", "20");
  url.searchParams.set("key", apiKey);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`youtube ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as YouTubeVideosResponse;
  return data.items.map((item, i) => ({
    baslik: item.snippet.title,
    kaynak: "youtube" as const,
    url: `https://www.youtube.com/watch?v=${item.id}`,
    // sıralama zaten popülerliğe göre; ilk sıradakine en yüksek skor
    tahminiIlgi: Math.max(0.2, 1 - i / data.items.length),
  }));
}
