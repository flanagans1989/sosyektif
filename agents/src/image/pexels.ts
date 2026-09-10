import { optionalEnv } from "../lib/env.js";

export interface StockPhoto {
  buffer: Buffer;
  credit: string;
  sourceUrl: string;
}

interface PexelsSearchResponse {
  photos: {
    src: { large2x: string };
    photographer: string;
    photographer_url: string;
    url: string;
  }[];
}

/** Pexels API — 200 istek/saat, 20.000/ay, ticari kullanım serbest (PLAN.md). */
export async function fetchPexelsPhoto(keyword: string): Promise<StockPhoto | null> {
  const apiKey = optionalEnv("PEXELS_API_KEY");
  if (!apiKey) return null;

  const url = new URL("https://api.pexels.com/v1/search");
  url.searchParams.set("query", keyword);
  url.searchParams.set("orientation", "landscape");
  url.searchParams.set("per_page", "5");

  const res = await fetch(url, { headers: { Authorization: apiKey } });
  if (!res.ok) {
    console.warn(`[image/pexels] arama başarısız: ${res.status}`);
    return null;
  }

  const data = (await res.json()) as PexelsSearchResponse;
  const photo = data.photos[0];
  if (!photo) return null;

  const imgRes = await fetch(photo.src.large2x);
  if (!imgRes.ok) return null;
  const buffer = Buffer.from(await imgRes.arrayBuffer());

  return {
    buffer,
    credit: `Photo by ${photo.photographer} on Pexels`,
    sourceUrl: photo.url,
  };
}
