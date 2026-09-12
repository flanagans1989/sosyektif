/**
 * Sosyal medya paylaşımı için görsel üretimi (PLAN.md Bölüm 11.2).
 * Instagram API yalnızca JPEG kabul ediyor; Threads/Instagram akışında
 * dikey (4:5) görseller daha iyi yer kaplıyor. Mevcut yatay WebP kapak
 * (site içi kullanım) bundan etkilenmez, ayrı bir üretim yoludur.
 *
 * 2026-09-13: ilk tasarım çok sade/düz bulundu ("hoş gözükmüyor") — emoji,
 * kart/gölge hissi veren katmanlar ve dekoratif arka plan eklendi.
 */
import sharp from "sharp";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { SITE_DIR } from "../lib/paths.js";
import type { Post, Format } from "../lib/schemas.js";

const SOCIAL_DIR = path.join(SITE_DIR, "public", "images", "social");
const GENISLIK = 1080;
const YUKSEKLIK = 1350;
const MERKEZ_X = GENISLIK / 2;

const RENK_ZEMIN = "#FFFAF7";
const RENK_MARKA = "#FF4F64";
const RENK_MARKA_KOYU = "#E23A50";
const RENK_MUREKKEP = "#201A1C";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wordWrap(text: string, maxCharsPerLine: number, maxLines = 6): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const aday = current ? `${current} ${word}` : word;
    if (aday.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = aday;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, maxLines);
}

/** Dekoratif arka plan blobları — düz tek renk yerine derinlik hissi verir. */
function arkaPlanBloblari(vurguRengi: string, zeminRengi: string): string {
  return `
    <rect width="${GENISLIK}" height="${YUKSEKLIK}" fill="${zeminRengi}"/>
    <circle cx="${GENISLIK + 60}" cy="120" r="380" fill="${vurguRengi}" opacity="0.10"/>
    <circle cx="-100" cy="${YUKSEKLIK - 180}" r="320" fill="${vurguRengi}" opacity="0.12"/>
  `;
}

/** Marka rozeti: yuvarlak köşeli kare + beyaz büyüteç (favicon/Logo.astro ile aynı çizim). */
function markaRozetiSvg(x: number, y: number, boyut: number): string {
  const olcek = boyut / 48;
  const rx = 11 * olcek;
  const cx = x + 21 * olcek;
  const cy = y + 21 * olcek;
  const r = 9.5 * olcek;
  const daireKalinlik = 4.5 * olcek;
  const x1 = x + 28.2 * olcek;
  const y1 = y + 28.2 * olcek;
  const x2 = x + 36.5 * olcek;
  const y2 = y + 36.5 * olcek;
  const sapKalinlik = 5 * olcek;
  return `
    <rect x="${x}" y="${y}" width="${boyut}" height="${boyut}" rx="${rx}" fill="${RENK_MARKA}"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#ffffff" stroke-width="${daireKalinlik}"/>
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#ffffff" stroke-width="${sapKalinlik}" stroke-linecap="round"/>
  `;
}

/** Ortak alt bilgi: marka rozeti + wordmark + sayfa numarası. */
function altBilgiSvg(sayfaNo: number, toplamSayfa: number, koyuZeminde = false): string {
  const metinRengi = koyuZeminde ? "#ffffff" : RENK_MUREKKEP;
  const ikonBoyut = 40;
  const ikonX = MERKEZ_X - 110;
  const ikonY = YUKSEKLIK - 82;
  return `
    ${koyuZeminde ? "" : markaRozetiSvg(ikonX, ikonY, ikonBoyut)}
    ${
      koyuZeminde
        ? `<circle cx="${ikonX + ikonBoyut / 2}" cy="${ikonY + ikonBoyut / 2}" r="${ikonBoyut / 2}" fill="#ffffff"/>
           <circle cx="${ikonX + ikonBoyut / 2 - 4}" cy="${ikonY + ikonBoyut / 2 - 4}" r="9" fill="none" stroke="${RENK_MARKA}" stroke-width="4"/>
           <line x1="${ikonX + ikonBoyut / 2 + 3}" y1="${ikonY + ikonBoyut / 2 + 3}" x2="${ikonX + ikonBoyut / 2 + 10}" y2="${ikonY + ikonBoyut / 2 + 10}" stroke="${RENK_MARKA}" stroke-width="4.5" stroke-linecap="round"/>`
        : ""
    }
    <text x="${ikonX + ikonBoyut + 14}" y="${ikonY + ikonBoyut / 2 + 9}" font-family="Arial, sans-serif" font-size="30" font-weight="800" fill="${metinRengi}">sosyektif.com</text>
    ${
      toplamSayfa > 1
        ? `<text x="540" y="${YUKSEKLIK - 108}" font-family="Arial, sans-serif" font-size="22" fill="${metinRengi}" opacity="0.7" text-anchor="middle">● ${sayfaNo}/${toplamSayfa}</text>`
        : ""
    }`;
}

/**
 * Format ikonları — emoji YERİNE elle çizilmiş vektör şekiller kullanılıyor:
 * `sharp`'ın SVG rasterlaştırması (librsvg), renkli emoji fontu kurulu
 * olmayan ortamlarda (ör. GitHub Actions ubuntu-latest runner) emoji'leri
 * ya siyah/bozuk bir yedek glif olarak ya da hiç göstermiyor — 2026-09-13'te
 * gerçek paylaşımlarda "görsel hoş gözükmüyor" şikayetiyle keşfedildi.
 * Metin içindeki emoji'ler (caption'lar) bundan etkilenmiyor — onlar
 * platformun kendi (renkli) emoji fontuyla render ediliyor.
 */
function formatIkonuSvg(format: Format, cx: number, cy: number, boyut: number, renk = RENK_MUREKKEP): string {
  const r = boyut / 2;
  if (format === "quiz") {
    return `
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="${renk}"/>
      <text x="${cx}" y="${cy + boyut * 0.18}" font-family="Arial, sans-serif" font-size="${boyut * 0.85}" font-weight="800" fill="#fff" text-anchor="middle">?</text>
    `;
  }
  if (format === "kisilik") {
    // Dört köşeli "sparkle" — köşegen doğrultuda uzun bir eksen + kısa bir eksen.
    const buyukKol = r;
    const kucukKol = r * 0.32;
    return `
      <path d="M ${cx} ${cy - buyukKol}
               Q ${cx + kucukKol} ${cy - kucukKol} ${cx + buyukKol} ${cy}
               Q ${cx + kucukKol} ${cy + kucukKol} ${cx} ${cy + buyukKol}
               Q ${cx - kucukKol} ${cy + kucukKol} ${cx - buyukKol} ${cy}
               Q ${cx - kucukKol} ${cy - kucukKol} ${cx} ${cy - buyukKol} Z"
        fill="${renk}"/>
      <circle cx="${cx + buyukKol * 0.7}" cy="${cy - buyukKol * 0.7}" r="${boyut * 0.06}" fill="${renk}"/>
      <circle cx="${cx - buyukKol * 0.55}" cy="${cy + buyukKol * 0.6}" r="${boyut * 0.09}" fill="${renk}"/>
    `;
  }
  // liste / trivia (varsayılan): madde imli liste ikonu.
  const genislik = boyut * 0.9;
  const solX = cx - genislik / 2;
  const satirY = [cy - boyut * 0.28, cy, cy + boyut * 0.28];
  const uzunluklar = [genislik * 0.72, genislik, genislik * 0.55];
  return satirY
    .map(
      (y, i) => `
        <circle cx="${solX - boyut * 0.1}" cy="${y}" r="${boyut * 0.045}" fill="${renk}"/>
        <rect x="${solX}" y="${y - boyut * 0.035}" width="${uzunluklar[i]}" height="${boyut * 0.07}" rx="${boyut * 0.035}" fill="${renk}"/>
      `
    )
    .join("");
}

/** Kapanış slaydında kullanılan "hedefe ulaştın" rozeti — check işareti. */
function checkRozetiSvg(cx: number, cy: number, boyut: number): string {
  const r = boyut / 2;
  return `
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffffff"/>
    <path d="M ${cx - r * 0.5} ${cy} L ${cx - r * 0.12} ${cy + r * 0.38} L ${cx + r * 0.55} ${cy - r * 0.38}"
      fill="none" stroke="${RENK_MARKA}" stroke-width="${boyut * 0.1}" stroke-linecap="round" stroke-linejoin="round"/>
  `;
}

/** Yuvarlak köşeli "pill" rozet — kısa etiket/CTA metinleri için. */
function pillSvg(
  metin: string,
  cx: number,
  cy: number,
  { dolgu = RENK_MARKA, yaziRengi = "#ffffff", fontBoyut = 34 }: { dolgu?: string; yaziRengi?: string; fontBoyut?: number } = {}
): string {
  const genislik = metin.length * fontBoyut * 0.62 + 80;
  const yukseklik = fontBoyut + 46;
  const x = cx - genislik / 2;
  const y = cy - yukseklik / 2;
  return `
    <rect x="${x}" y="${y}" width="${genislik}" height="${yukseklik}" rx="${yukseklik / 2}" fill="${dolgu}"/>
    <text x="${cx}" y="${cy + fontBoyut * 0.32}" font-family="Arial, sans-serif" font-size="${fontBoyut}" font-weight="800" fill="${yaziRengi}" text-anchor="middle">${escapeXml(metin)}</text>
  `;
}

function kapakSlaytSvg(baslik: string, altMetin: string, toplamSayfa: number, format: Format): string {
  const satirlar = wordWrap(baslik, 18, 5);
  const baslangicY = 660 - (satirlar.length - 1) * 44;
  const tspanlar = satirlar
    .map((s, i) => `<tspan x="540" y="${baslangicY + i * 88}">${escapeXml(s)}</tspan>`)
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${GENISLIK}" height="${YUKSEKLIK}" viewBox="0 0 ${GENISLIK} ${YUKSEKLIK}">
    ${arkaPlanBloblari(RENK_MARKA, RENK_ZEMIN)}
    <circle cx="540" cy="320" r="120" fill="${RENK_MARKA}" opacity="0.12"/>
    ${formatIkonuSvg(format, 540, 320, 130, RENK_MARKA)}
    <text font-family="Arial, sans-serif" font-size="62" font-weight="800" fill="${RENK_MUREKKEP}" text-anchor="middle">${tspanlar}</text>
    ${pillSvg(altMetin, MERKEZ_X, 850)}
    ${altBilgiSvg(1, toplamSayfa)}
  </svg>`;
}

function madddeSlaytSvg(
  numara: number,
  baslik: string,
  metin: string,
  sayfaNo: number,
  toplamSayfa: number
): string {
  const baslikSatirlari = wordWrap(baslik, 22, 3);
  const metinSatirlari = wordWrap(metin, 26, 7);

  const kartUst = 300;
  const kartYukseklik = 130 + baslikSatirlari.length * 58 + 50 + metinSatirlari.length * 42 + 60;

  const baslikBaslangic = kartUst + 130;
  const baslikTspan = baslikSatirlari
    .map((s, i) => `<tspan x="540" y="${baslikBaslangic + i * 58}">${escapeXml(s)}</tspan>`)
    .join("");
  const metinBaslangic = baslikBaslangic + baslikSatirlari.length * 58 + 50;
  const metinTspan = metinSatirlari
    .map((s, i) => `<tspan x="540" y="${metinBaslangic + i * 42}">${escapeXml(s)}</tspan>`)
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${GENISLIK}" height="${YUKSEKLIK}" viewBox="0 0 ${GENISLIK} ${YUKSEKLIK}">
    ${arkaPlanBloblari(RENK_MARKA, RENK_ZEMIN)}
    <rect x="90" y="${kartUst}" width="900" height="${kartYukseklik}" rx="40" fill="#00000012"/>
    <rect x="80" y="${kartUst - 10}" width="900" height="${kartYukseklik}" rx="40" fill="#ffffff"/>
    <circle cx="540" cy="${kartUst}" r="86" fill="${RENK_MARKA_KOYU}"/>
    <circle cx="540" cy="${kartUst - 6}" r="86" fill="${RENK_MARKA}"/>
    <text x="540" y="${kartUst + 24}" font-family="Arial, sans-serif" font-size="76" font-weight="800" fill="#fff" text-anchor="middle">${numara}</text>
    <text font-family="Arial, sans-serif" font-size="46" font-weight="800" fill="${RENK_MUREKKEP}" text-anchor="middle">${baslikTspan}</text>
    <text font-family="Arial, sans-serif" font-size="32" fill="${RENK_MUREKKEP}bb" text-anchor="middle">${metinTspan}</text>
    ${altBilgiSvg(sayfaNo, toplamSayfa)}
  </svg>`;
}

function kapanisSlaytSvg(mesaj: string, toplamSayfa: number): string {
  const satirlar = wordWrap(mesaj, 20, 4);
  const baslangicY = 650 - (satirlar.length - 1) * 42;
  const tspanlar = satirlar
    .map((s, i) => `<tspan x="540" y="${baslangicY + i * 82}">${escapeXml(s)}</tspan>`)
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${GENISLIK}" height="${YUKSEKLIK}" viewBox="0 0 ${GENISLIK} ${YUKSEKLIK}">
    <rect width="${GENISLIK}" height="${YUKSEKLIK}" fill="${RENK_MARKA}"/>
    <circle cx="-80" cy="150" r="300" fill="#ffffff" opacity="0.08"/>
    <circle cx="${GENISLIK + 100}" cy="${YUKSEKLIK - 200}" r="360" fill="#ffffff" opacity="0.08"/>
    ${checkRozetiSvg(540, 340, 160)}
    <text font-family="Arial, sans-serif" font-size="58" font-weight="800" fill="#fff" text-anchor="middle">${tspanlar}</text>
    ${pillSvg("sosyektif.com", MERKEZ_X, YUKSEKLIK - 140, { dolgu: "#ffffff", yaziRengi: RENK_MARKA, fontBoyut: 36 })}
  </svg>`;
}

async function svgToJpeg(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg)).resize(GENISLIK, YUKSEKLIK).jpeg({ quality: 90 }).toBuffer();
}

/**
 * İçerik formatına göre 1080x1350 kaydırmalı gönderi (carousel) slaytları
 * üretir. En fazla 10 slayt (Instagram carousel sınırı).
 */
export async function generateCarouselSlides(post: Post): Promise<Buffer[]> {
  const slaytlar: string[] = [];
  const MAKS_SLAYT = 10;

  if ((post.format === "liste" || post.format === "trivia") && post.listeMaddeleri) {
    const maddeler = post.listeMaddeleri.slice(0, MAKS_SLAYT - 1);
    const toplam = maddeler.length + 1;
    slaytlar.push(kapakSlaytSvg(post.baslik, "Kaydır →", toplam, post.format));
    maddeler.forEach((madde, i) => {
      slaytlar.push(madddeSlaytSvg(i + 1, madde.baslik, madde.metin, i + 2, toplam));
    });
  } else if (post.format === "quiz" && post.quizSorulari) {
    const sorular = post.quizSorulari.slice(0, MAKS_SLAYT - 2);
    const toplam = sorular.length + 2;
    slaytlar.push(kapakSlaytSvg(post.baslik, "Kaç tanesini bilebilirsin?", toplam, post.format));
    sorular.forEach((soru, i) => {
      slaytlar.push(madddeSlaytSvg(i + 1, soru.soru, soru.secenekler.join(" · "), i + 2, toplam));
    });
    slaytlar.push(kapanisSlaytSvg("Cevapları ve skorunu görmek için siteye gel!", toplam));
  } else if (post.format === "kisilik") {
    slaytlar.push(kapakSlaytSvg(post.baslik, "Testi çöz, sonucunu öğren", 1, post.format));
  } else {
    // Beklenmeyen/eksik veri — tek kapak slaytıyla devam et.
    slaytlar.push(kapakSlaytSvg(post.baslik, post.metaAciklama, 1, post.format));
  }

  return Promise.all(slaytlar.map(svgToJpeg));
}

/**
 * Carousel slaytlarını public/images/social/<slug>-N.jpg olarak yazar ve
 * herkese açık URL + yerel dosya yolu listesini döner (Cloudflare Pages
 * public/ klasörünü olduğu gibi sunuyor — ayrı bir barındırma servisi
 * gerekmez; dosya yolu, paylaşımdan önce hemen commit+push edilmesi için
 * gerekiyor — bkz. lib/gitYayinla.ts).
 * Not: dosyalar kalıcı kalır (silinmez) — PLAN.md R9'da hesaplanan dosya
 * bütçesine küçük bir ek yapar, bilinçli bir basitleştirme.
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
