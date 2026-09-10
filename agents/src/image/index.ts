import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { IMAGES_DIR } from "../lib/paths.js";
import { fetchPexelsPhoto, type StockPhoto } from "./pexels.js";
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

async function stokAra(terim: string): Promise<StockPhoto | null> {
  return (await fetchPexelsPhoto(terim)) ?? (await fetchUnsplashPhoto(terim));
}

/**
 * Kapak görseli seçimi (PLAN.md R10):
 *  - Konu bir KİŞİ ise stok fotoğraf aranmaz → tipografik kapak. (Stok bir
 *    yüzün gerçek bir kişiyle ilişkilendirilmesi kişilik hakkı ve Pexels
 *    lisansı açısından risklidir.)
 *  - Kişi değilse önce konunun İngilizce adıyla aranır ("Octopus" gibi) —
 *    ilk sürüm yalnızca kategori kelimesiyle arıyordu ve ahtapot yazısına
 *    laboratuvar fotoğrafı geldi. Bulunamazsa kategori kelimesine düşülür.
 *  - Hiçbiri yoksa tipografik kapak.
 */
export async function generateCoverImage(params: {
  slug: string;
  baslik: string;
  kategori: Kategori;
  kisiMi?: boolean;
  konuAramaTerimi?: string;
}): Promise<CoverImageResult> {
  await mkdir(IMAGES_DIR, { recursive: true });

  let stok: StockPhoto | null = null;
  if (!params.kisiMi) {
    const terimler = [params.konuAramaTerimi, KATEGORI_ARAMA_KELIMELERI[params.kategori]].filter(
      (t): t is string => Boolean(t)
    );
    for (const terim of terimler) {
      stok = await stokAra(terim);
      if (stok) break;
    }
  }

  const dosyaAdi = `${params.slug}.webp`;
  const dosyaYolu = path.join(IMAGES_DIR, dosyaAdi);

  if (stok) {
    const webpBuffer = await sharp(stok.buffer)
      .resize(GENISLIK, YUKSEKLIK, { fit: "cover" })
      .webp({ quality: 82 })
      .toBuffer();
    await writeFile(dosyaYolu, webpBuffer);
    return { publicPath: `/images/posts/${dosyaAdi}`, alt: params.baslik, kredi: stok.credit };
  }

  const svg = generateTypographicCoverSvg(params.baslik);
  const webpBuffer = await sharp(Buffer.from(svg))
    .resize(GENISLIK, YUKSEKLIK, { fit: "cover" })
    .webp({ quality: 90 })
    .toBuffer();
  await writeFile(dosyaYolu, webpBuffer);
  return { publicPath: `/images/posts/${dosyaAdi}`, alt: params.baslik };
}
