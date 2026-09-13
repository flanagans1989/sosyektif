/**
 * Instagram carousel slaytları (PLAN.md Bölüm 11.2): 1080×1350 JPEG.
 *
 * 2026-09-13: SVG + sharp yaklaşımı bırakıldı (metin ölçülemediği için
 * orantılar bozuluyor, fotoğraf olmadığı için görseller sade kalıyordu).
 * Şablonlar artık HTML/CSS (socialSablon.ts), gerçek bir tarayıcıda render
 * ediliyor (htmlRender.ts) ve arka planda içeriğin kendi kapak fotoğrafı var.
 */
import path from "node:path";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { SITE_DIR } from "../lib/paths.js";
import { FORMAT_EMOJI, FORMAT_ETIKETLERI_TR, KATEGORI_EMOJI } from "../lib/formatLabels.js";
import type { Post } from "../lib/schemas.js";
import { htmlSlaytlariRenderEt } from "./htmlRender.js";
import {
  SLAYT_GENISLIK,
  SLAYT_YUKSEKLIK,
  kapakSlayti,
  kapanisSlayti,
  maddeSlayti,
  soruSlayti,
  sonuclarSlayti,
  type SlaytBaglami,
} from "./socialSablon.js";

const SOCIAL_DIR = path.join(SITE_DIR, "public", "images", "social");
const MAKS_SLAYT = 10; // Instagram carousel sınırı

/** site/src/lib/kategoriler.ts ile aynı etiketler. */
export const KATEGORI_ETIKETLERI: Record<string, string> = {
  eglence: "Eğlence",
  "pop-kultur": "Pop Kültür",
  bilim: "Bilim",
  teknoloji: "Teknoloji",
  spor: "Spor",
  yasam: "Yaşam",
  tarih: "Tarih",
  ekonomi: "Ekonomi",
};

/**
 * Kapak fotoğrafını (site/public altındaki webp) data URI'ye çevirir.
 * Sayfaya gömülü olduğu için render sırasında dosya/ağ erişimi gerekmez;
 * boyutu küçültülür ki her slaytta tekrar gömülmesi sorun olmasın.
 */
async function kapakFotosuDataUri(kapakGorseli: string): Promise<string | null> {
  if (!kapakGorseli.startsWith("/")) return null;
  const dosya = path.join(SITE_DIR, "public", kapakGorseli);
  if (!existsSync(dosya)) return null;
  try {
    const jpeg = await sharp(await readFile(dosya))
      .resize(1400, 1400, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function carouselHtmlBelgeleri(post: Post): Promise<string[]> {
  const baglam: SlaytBaglami = {
    fotoDataUri: await kapakFotosuDataUri(post.kapakGorseli),
    kategoriEtiketi: KATEGORI_ETIKETLERI[post.kategori] ?? post.kategori,
    kategoriEmoji: KATEGORI_EMOJI[post.kategori] ?? "🔍",
    formatEtiketi: FORMAT_ETIKETLERI_TR[post.format],
    formatEmoji: FORMAT_EMOJI[post.format],
  };

  if ((post.format === "liste" || post.format === "trivia") && post.listeMaddeleri?.length) {
    const maddeler = post.listeMaddeleri.slice(0, MAKS_SLAYT - 2);
    const toplam = maddeler.length + 2;
    return [
      kapakSlayti(baglam, {
        baslik: post.baslik,
        aciklama: post.metaAciklama,
        cta: "Kaydır",
        toplam,
        ozet: `${post.listeMaddeleri.length} madde`,
      }),
      ...maddeler.map((m, i) =>
        maddeSlayti(baglam, {
          no: i + 1,
          maddeSayisi: post.listeMaddeleri!.length,
          baslik: m.baslik,
          metin: m.metin,
          sira: i + 1,
          toplam,
        })
      ),
      kapanisSlayti(baglam, {
        baslik:
          post.listeMaddeleri.length > maddeler.length
            ? `Kalan ${post.listeMaddeleri.length - maddeler.length} madde sitede`
            : "Kaynaklar ve fazlası sitede",
        altBaslik: "Link profilde 👆",
        sira: toplam - 1,
        toplam,
      }),
    ];
  }

  if (post.format === "quiz" && post.quizSorulari?.length) {
    const sorular = post.quizSorulari.slice(0, MAKS_SLAYT - 2);
    const toplam = sorular.length + 2;
    return [
      kapakSlayti(baglam, {
        baslik: post.baslik,
        aciklama: post.metaAciklama,
        cta: "Teste başla",
        toplam,
        ozet: `${post.quizSorulari.length} soru`,
      }),
      ...sorular.map((s, i) =>
        soruSlayti(baglam, {
          no: i + 1,
          soruSayisi: post.quizSorulari!.length,
          soru: s.soru,
          secenekler: s.secenekler,
          sira: i + 1,
          toplam,
        })
      ),
      kapanisSlayti(baglam, {
        baslik: "Kaç tanesini bildin? Cevaplar sitede",
        altBaslik: "Link profilde 👆",
        sira: toplam - 1,
        toplam,
      }),
    ];
  }

  if (post.format === "kisilik") {
    const sonuclar = (post.kisilikSonuclari ?? []).map((s) => s.baslik);
    const toplam = sonuclar.length ? 3 : 2;
    const slaytlar = [
      kapakSlayti(baglam, {
        baslik: post.baslik,
        aciklama: post.metaAciklama,
        cta: "Testi çöz",
        toplam,
        ozet: post.kisilikSorulari?.length ? `${post.kisilikSorulari.length} soru` : undefined,
      }),
    ];
    if (sonuclar.length) slaytlar.push(sonuclarSlayti(baglam, { sonuclar, sira: 1, toplam }));
    slaytlar.push(
      kapanisSlayti(baglam, {
        baslik: "Testi çöz, sonucunu yorumlara yaz",
        altBaslik: "Link profilde 👆",
        sira: toplam - 1,
        toplam,
      })
    );
    return slaytlar;
  }

  // Beklenmeyen/eksik veri — tek kapak.
  return [
    kapakSlayti(baglam, { baslik: post.baslik, aciklama: post.metaAciklama, cta: "Sitede oku", toplam: 1 }),
  ];
}

export async function generateCarouselSlides(post: Post): Promise<Buffer[]> {
  return htmlSlaytlariRenderEt(await carouselHtmlBelgeleri(post), {
    genislik: SLAYT_GENISLIK,
    yukseklik: SLAYT_YUKSEKLIK,
  });
}

/**
 * Slaytları public/images/social/<slug>-N.jpg olarak yazar; herkese açık URL
 * ve yerel dosya yolunu döner (yol, paylaşımdan önce hemen commit+push için
 * gerekiyor — bkz. lib/gitYayinla.ts). Dosyalar kalıcı kalır (R9 bütçesine
 * küçük bir ek, bilinçli basitleştirme).
 */
export async function writeCarouselSlides(
  slug: string,
  buffers: Buffer[]
): Promise<{ url: string; dosyaYolu: string }[]> {
  await mkdir(SOCIAL_DIR, { recursive: true });
  const sonuc: { url: string; dosyaYolu: string }[] = [];
  for (const [i, buffer] of buffers.entries()) {
    const dosyaAdi = `${slug}-${i + 1}.jpg`;
    const dosyaYolu = path.join(SOCIAL_DIR, dosyaAdi);
    await writeFile(dosyaYolu, buffer);
    sonuc.push({ url: `https://sosyektif.com/images/social/${dosyaAdi}`, dosyaYolu });
  }
  return sonuc;
}

/** writeCarouselSlides'ın video karşılığı — bkz. reelRender.ts. */
export async function writeReelVideo(
  slug: string,
  video: Buffer
): Promise<{ url: string; dosyaYolu: string }> {
  await mkdir(SOCIAL_DIR, { recursive: true });
  const dosyaAdi = `${slug}-reel.mp4`;
  const dosyaYolu = path.join(SOCIAL_DIR, dosyaAdi);
  await writeFile(dosyaYolu, video);
  return { url: `https://sosyektif.com/images/social/${dosyaAdi}`, dosyaYolu };
}
