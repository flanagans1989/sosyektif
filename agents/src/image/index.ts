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
 *  - Arama terimi olarak konunun kendi adı (İngilizce Vikipedi başlığı vb.)
 *    KULLANILMAZ — özellikle kişi/nadir özel isimlerde Pexels alakasız sonuç
 *    döndürüyor (ör. "Kayqubad I" aramasında bir tekne fotoğrafı çıktı).
 *    Bunun yerine İçerik Ajanı'nın ürettiği `gorselAramaTerimi` kullanılır:
 *    bu, LLM tarafından üretilmiş, kişi içermeyen somut bir sahne tarifidir
 *    (ör. bir sultan için "medieval castle stone", ahtapot için "octopus
 *    underwater"). Bulunamazsa kategori anahtar kelimesine düşülür.
 *  - Kişi konularında (kisiMi: true) bu terim zaten kişinin kendisini değil
 *    dönemini/eserini tarif eder; yine de gerçek bir portre gelme ihtimaline
 *    karşı ekstra güvenlik yoktur — bu yüzden yazım kuralı prompttadır.
 *  - Hiçbir stok sonucu yoksa tipografik kapak kullanılır.
 */
export async function generateCoverImage(params: {
  slug: string;
  baslik: string;
  kategori: Kategori;
  gorselAramaTerimi?: string;
}): Promise<CoverImageResult> {
  await mkdir(IMAGES_DIR, { recursive: true });

  const terimler = [params.gorselAramaTerimi, KATEGORI_ARAMA_KELIMELERI[params.kategori]].filter(
    (t): t is string => Boolean(t && t.trim())
  );

  let stok: StockPhoto | null = null;
  for (const terim of terimler) {
    stok = await stokAra(terim);
    if (stok) break;
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
