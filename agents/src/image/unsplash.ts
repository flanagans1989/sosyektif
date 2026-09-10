import { optionalEnv } from "../lib/env.js";
import type { StockPhoto } from "./pexels.js";

interface UnsplashPhoto {
  urls: { regular: string };
  user: { name: string; links: { html: string } };
  links: { html: string };
}

/** Unsplash API — ticari kullanım serbest, Pexels'in yedeği. */
export async function fetchUnsplashPhoto(keyword: string): Promise<StockPhoto | null> {
  const accessKey = optionalEnv("UNSPLASH_ACCESS_KEY");
  if (!accessKey) return null;

  const url = new URL("https://api.unsplash.com/photos/random");
  url.searchParams.set("query", keyword);
  url.searchParams.set("orientation", "landscape");

  const res = await fetch(url, {
    headers: { Authorization: `Client-ID ${accessKey}` },
  });
  if (!res.ok) {
    console.warn(`[image/unsplash] arama başarısız: ${res.status}`);
    return null;
  }

  const photo = (await res.json()) as UnsplashPhoto;
  const imgRes = await fetch(photo.urls.regular);
  if (!imgRes.ok) return null;
  const buffer = Buffer.from(await imgRes.arrayBuffer());

  return {
    buffer,
    credit: `Photo by ${photo.user.name} on Unsplash`,
    sourceUrl: photo.links.html,
  };
}
