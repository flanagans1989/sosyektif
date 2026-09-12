/**
 * Sosyal medya paylaşımı için görsel üretimi (PLAN.md Bölüm 11.2).
 * Instagram API yalnızca JPEG kabul ediyor; Threads/Instagram akışında
 * dikey (4:5) görseller daha iyi yer kaplıyor. Mevcut yatay WebP kapak
 * (site içi kullanım) bundan etkilenmez, ayrı bir üretim yoludur.
 */
import sharp from "sharp";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { SITE_DIR } from "../lib/paths.js";
import type { Post } from "../lib/schemas.js";

const SOCIAL_DIR = path.join(SITE_DIR, "public", "images", "social");
const GENISLIK = 1080;
const YUKSEKLIK = 1350;

const RENK_ZEMIN = "#FFFAF7";
const RENK_MARKA = "#FF4F64";
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

/** Ortak alt bilgi: marka + sayfa numarası. */
function altBilgiSvg(sayfaNo: number, toplamSayfa: number): string {
  return `
    <text x="540" y="${YUKSEKLIK - 60}" font-family="Arial, sans-serif" font-size="28" fill="${RENK_MARKA}" text-anchor="middle" font-weight="800">sosyektif.com</text>
    ${
      toplamSayfa > 1
        ? `<text x="540" y="${YUKSEKLIK - 100}" font-family="Arial, sans-serif" font-size="22" fill="${RENK_MUREKKEP}aa" text-anchor="middle">${sayfaNo}/${toplamSayfa}</text>`
        : ""
    }`;
}

function kapakSlaytSvg(baslik: string, altMetin: string, toplamSayfa: number): string {
  const satirlar = wordWrap(baslik, 20, 5);
  const baslangicY = 620 - (satirlar.length - 1) * 45;
  const tspanlar = satirlar
    .map((s, i) => `<tspan x="540" y="${baslangicY + i * 90}">${escapeXml(s)}</tspan>`)
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${GENISLIK}" height="${YUKSEKLIK}" viewBox="0 0 ${GENISLIK} ${YUKSEKLIK}">
    <rect width="${GENISLIK}" height="${YUKSEKLIK}" fill="${RENK_ZEMIN}"/>
    <rect width="${GENISLIK}" height="${YUKSEKLIK}" fill="url(#g)" opacity="0.15"/>
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${RENK_MARKA}"/>
        <stop offset="1" stop-color="${RENK_ZEMIN}"/>
      </linearGradient>
    </defs>
    <text font-family="Arial, sans-serif" font-size="64" font-weight="800" fill="${RENK_MUREKKEP}" text-anchor="middle">${tspanlar}</text>
    <text x="540" y="760" font-family="Arial, sans-serif" font-size="32" fill="${RENK_MUREKKEP}cc" text-anchor="middle">${escapeXml(altMetin)}</text>
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
  const baslikSatirlari = wordWrap(baslik, 24, 3);
  const metinSatirlari = wordWrap(metin, 28, 8);

  const baslikTspan = baslikSatirlari
    .map((s, i) => `<tspan x="540" y="${420 + i * 62}">${escapeXml(s)}</tspan>`)
    .join("");
  const metinTspan = metinSatirlari
    .map((s, i) => `<tspan x="540" y="${420 + baslikSatirlari.length * 62 + 70 + i * 44}">${escapeXml(s)}</tspan>`)
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${GENISLIK}" height="${YUKSEKLIK}" viewBox="0 0 ${GENISLIK} ${YUKSEKLIK}">
    <rect width="${GENISLIK}" height="${YUKSEKLIK}" fill="${RENK_ZEMIN}"/>
    <circle cx="540" cy="260" r="90" fill="${RENK_MARKA}"/>
    <text x="540" y="290" font-family="Arial, sans-serif" font-size="80" font-weight="800" fill="#fff" text-anchor="middle">${numara}</text>
    <text font-family="Arial, sans-serif" font-size="50" font-weight="800" fill="${RENK_MUREKKEP}" text-anchor="middle">${baslikTspan}</text>
    <text font-family="Arial, sans-serif" font-size="34" fill="${RENK_MUREKKEP}cc" text-anchor="middle">${metinTspan}</text>
    ${altBilgiSvg(sayfaNo, toplamSayfa)}
  </svg>`;
}

function kapanisSlaytSvg(mesaj: string, toplamSayfa: number): string {
  const satirlar = wordWrap(mesaj, 22, 4);
  const baslangicY = 620 - (satirlar.length - 1) * 40;
  const tspanlar = satirlar
    .map((s, i) => `<tspan x="540" y="${baslangicY + i * 80}">${escapeXml(s)}</tspan>`)
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${GENISLIK}" height="${YUKSEKLIK}" viewBox="0 0 ${GENISLIK} ${YUKSEKLIK}">
    <rect width="${GENISLIK}" height="${YUKSEKLIK}" fill="${RENK_MARKA}"/>
    <text font-family="Arial, sans-serif" font-size="56" font-weight="800" fill="#fff" text-anchor="middle">${tspanlar}</text>
    <text x="540" y="${YUKSEKLIK - 80}" font-family="Arial, sans-serif" font-size="30" fill="#fff" text-anchor="middle" font-weight="700">sosyektif.com</text>
  </svg>`;
}

async function svgToJpeg(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg)).resize(GENISLIK, YUKSEKLIK).jpeg({ quality: 88 }).toBuffer();
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
    slaytlar.push(kapakSlaytSvg(post.baslik, "Kaydır →", toplam));
    maddeler.forEach((madde, i) => {
      slaytlar.push(madddeSlaytSvg(i + 1, madde.baslik, madde.metin, i + 2, toplam));
    });
  } else if (post.format === "quiz" && post.quizSorulari) {
    const sorular = post.quizSorulari.slice(0, MAKS_SLAYT - 2);
    const toplam = sorular.length + 2;
    slaytlar.push(kapakSlaytSvg(post.baslik, "Kaç tanesini bilebilirsin?", toplam));
    sorular.forEach((soru, i) => {
      slaytlar.push(madddeSlaytSvg(i + 1, soru.soru, soru.secenekler.join(" · "), i + 2, toplam));
    });
    slaytlar.push(kapanisSlaytSvg("Cevapları ve skorunu görmek için siteye gel!", toplam));
  } else if (post.format === "kisilik") {
    slaytlar.push(kapakSlaytSvg(post.baslik, "Testi çöz, sonucunu öğren", 1));
  } else {
    // Beklenmeyen/eksik veri — tek kapak slaytıyla devam et.
    slaytlar.push(kapakSlaytSvg(post.baslik, post.metaAciklama, 1));
  }

  return Promise.all(slaytlar.map(svgToJpeg));
}

/**
 * Carousel slaytlarını public/images/social/<slug>-N.jpg olarak yazar ve
 * herkese açık URL listesini döner (Cloudflare Pages public/ klasörünü
 * olduğu gibi sunuyor — ayrı bir barındırma servisi gerekmez).
 * Not: dosyalar kalıcı kalır (silinmez) — PLAN.md R9'da hesaplanan dosya
 * bütçesine küçük bir ek yapar, bilinçli bir basitleştirme.
 */
export async function writeCarouselSlides(slug: string, buffers: Buffer[]): Promise<string[]> {
  await mkdir(SOCIAL_DIR, { recursive: true });
  const urls: string[] = [];
  for (const [i, buffer] of buffers.entries()) {
    const dosyaAdi = `${slug}-${i + 1}.jpg`;
    await writeFile(path.join(SOCIAL_DIR, dosyaAdi), buffer);
    urls.push(`https://sosyektif.com/images/social/${dosyaAdi}`);
  }
  return urls;
}
