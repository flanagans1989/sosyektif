import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { IMAGES_DIR } from "../lib/paths.js";
import { fetchPexelsPhoto } from "./pexels.js";
import { fetchUnsplashPhoto } from "./unsplash.js";
import { generateTypographicCoverSvg } from "./typographic.js";
import { KATEGORI_ARAMA_KELIMELERI } from "./categoryKeywords.js";
import type { Kategori } from "../lib/schemas.js";

export interface CoverImageResult {
  /** Site içinde kullanılacak public yol, örn. /images/posts/foo.webp */
  publicPath: string;
  alt: string;
  kredi?: string;
}

const GENISLIK = 1200;
const YUKSEKLIK = 675;

export async function generateCoverImage(params: {
  slug: string;
  baslik: string;
  kategori: Kategori;
}): Promise<CoverImageResult> {
  await mkdir(IMAGES_DIR, { recursive: true });
  const keyword = KATEGORI_ARAMA_KELIMELERI[params.kategori];

  const stok = (await fetchPexelsPhoto(keyword)) ?? (await fetchUnsplashPhoto(keyword));

  const dosyaAdi = `${params.slug}.webp`;
  const dosyaYolu = path.join(IMAGES_DIR, dosyaAdi);

  if (stok) {
    const webpBuffer = await sharp(stok.buffer)
      .resize(GENISLIK, YUKSEKLIK, { fit: "cover" })
      .webp({ quality: 82 })
      .toBuffer();
    await writeFile(dosyaYolu, webpBuffer);

    return {
      publicPath: `/images/posts/${dosyaAdi}`,
      alt: params.baslik,
      kredi: stok.credit,
    };
  }

  // Son yedek: yerel tipografik kapak — lisans riski sıfır (PLAN.md R10)
  const svg = generateTypographicCoverSvg(params.baslik);
  const webpBuffer = await sharp(Buffer.from(svg))
    .resize(GENISLIK, YUKSEKLIK, { fit: "cover" })
    .webp({ quality: 90 })
    .toBuffer();
  await writeFile(dosyaYolu, webpBuffer);

  return {
    publicPath: `/images/posts/${dosyaAdi}`,
    alt: params.baslik,
  };
}
