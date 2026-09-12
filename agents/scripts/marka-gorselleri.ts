/**
 * Sosyal medya profil/kapak görselleri üretir (PLAN.md Bölüm 11.2).
 * Marka öğeleri site/public/favicon.svg ve site/src/components/Logo.astro
 * ile birebir aynı (pembe kare + beyaz büyüteç) — tek doğruluk kaynağı orada,
 * burada sadece ölçekleniyor. Site build'ine dahil değil, elle çalıştırılıp
 * çıktılar Instagram/Threads/Facebook'a elle yüklenir (bu platformların API
 * ile profil/kapak fotoğrafı değiştirme desteği yok/kısıtlı).
 *
 * Kullanım: npm run marka-gorselleri (agents/ içinde) — çıktı dizinini argüman
 * olarak da alabilir: npm run marka-gorselleri -- /tmp/cikti
 */
import sharp from "sharp";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

const RENK_MARKA = "#FF4F64";
const RENK_MUREKKEP = "#201A1C";
const RENK_ZEMIN = "#FFFAF7";

const cikisDizini = process.argv[2] ?? path.join(process.cwd(), "marka-gorselleri-cikti");

/** favicon.svg / Logo.astro ile aynı ikon (viewBox 0..48), verilen boyuta ölçeklenir. */
function buyutecIkonSvg(boyut: number, x = 0, y = 0): string {
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

/**
 * Kare profil fotoğrafı — Instagram/Threads/Facebook hepsi bunu daireye
 * kırpıyor; ikon zaten favicon'da tam merkezde (bounding box hesaplandı),
 * bu yüzden ek boşluk payı gerekmiyor.
 */
function profilFotoSvg(boyut = 1080): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${boyut}" height="${boyut}" viewBox="0 0 ${boyut} ${boyut}">
    ${buyutecIkonSvg(boyut)}
  </svg>`;
}

/**
 * Facebook Sayfası kapak fotoğrafı (820x312 — Meta'nın önerdiği masaüstü
 * boyutu). Profil fotoğrafı sol-alt köşeyi kapladığı için lockup sağ yarıda.
 */
function kapakFotoSvg(genislik = 820, yukseklik = 312): string {
  // Facebook profil fotoğrafı kapağın sol-alt köşesini kaplıyor — lockup
  // sağ üçte birde, kenarlardan yeterli boşluk bırakılarak. Değerler
  // "820 genişlikte metin taşmasın" hedefiyle elle ayarlandı.
  const ikonBoyut = 84;
  const ikonX = genislik - 430;
  const ikonY = yukseklik / 2 - ikonBoyut / 2 - 10;
  const metinX = ikonX + ikonBoyut + 18;
  const metinY = yukseklik / 2 + 12;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${genislik}" height="${yukseklik}" viewBox="0 0 ${genislik} ${yukseklik}">
    <rect width="${genislik}" height="${yukseklik}" fill="${RENK_ZEMIN}"/>
    <rect width="${genislik}" height="${yukseklik}" fill="url(#g)" opacity="0.18"/>
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${RENK_MARKA}"/>
        <stop offset="1" stop-color="${RENK_ZEMIN}"/>
      </linearGradient>
    </defs>
    ${buyutecIkonSvg(ikonBoyut, ikonX, ikonY)}
    <text x="${metinX}" y="${metinY}" font-family="Arial, sans-serif" font-size="40" font-weight="800" fill="${RENK_MUREKKEP}">sos<tspan fill="${RENK_MARKA}">yektif</tspan></text>
    <text x="${metinX}" y="${metinY + 27}" font-family="Arial, sans-serif" font-size="14" fill="${RENK_MUREKKEP}" opacity="0.75">gündemi sosyektif bakış açısından oku</text>
  </svg>`;
}

async function main(): Promise<void> {
  await mkdir(cikisDizini, { recursive: true });

  const profilPng = await sharp(Buffer.from(profilFotoSvg())).png().toBuffer();
  await writeFile(path.join(cikisDizini, "profil-fotografi.png"), profilPng);

  const kapakPng = await sharp(Buffer.from(kapakFotoSvg())).png().toBuffer();
  await writeFile(path.join(cikisDizini, "facebook-kapak.png"), kapakPng);

  console.log(`Üretildi: ${cikisDizini}`);
  console.log("  - profil-fotografi.png (1080x1080, Instagram/Threads/Facebook profil fotoğrafı)");
  console.log("  - facebook-kapak.png (820x312, Facebook Sayfası kapak fotoğrafı)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
