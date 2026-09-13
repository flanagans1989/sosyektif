/**
 * YouTube kanalı profil fotoğrafı ve banner'ı (marka-gorselleri.ts'in YouTube
 * karşılığı). Marka öğeleri aynı: pembe kare + beyaz büyüteç, Poppins.
 * HTML/CSS Chromium'da render edilir (Instagram slaytlarıyla aynı yol).
 *
 * YouTube ölçüleri:
 *  - Profil: kare, en az 98x98, önerilen 800x800, ≤4MB (YouTube daireye kırpar).
 *  - Banner: 2048x1152, ≤6MB. Her cihazda görünen güvenli alan ortadaki
 *    1235x338 — logo ve yazı yalnızca orada; kenarlar TV/masaüstünde görünür.
 *
 * Kullanım: npm run youtube-gorselleri [-- cikti/dizini]
 */
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { fontFaceCss, tarayiciAc } from "../src/image/htmlRender.js";

const cikis = process.argv[2] ?? path.join(process.cwd(), "marka-gorselleri-cikti", "youtube");

const MARKA = "#FF4F64";
const MARKA_KOYU = "#D63A4D";
const MUREKKEP = "#201A1C";
const ZEMIN = "#FFFAF7";

function buyutec(boyut: number, kutu = true): string {
  return `<svg width="${boyut}" height="${boyut}" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
    ${kutu ? `<rect width="48" height="48" rx="11" fill="${MARKA}"/>` : ""}
    <circle cx="21" cy="21" r="9.5" fill="none" stroke="#fff" stroke-width="4.5"/>
    <line x1="28.2" y1="28.2" x2="36.5" y2="36.5" stroke="#fff" stroke-width="5" stroke-linecap="round"/>
  </svg>`;
}

const temel = (govde: string, en: number, boy: number) => `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFaceCss()}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${en}px;height:${boy}px;overflow:hidden;font-family:Poppins,sans-serif}
</style></head><body>${govde}</body></html>`;

/** Tam dolu pembe zemin, ortada beyaz büyüteç — daire kırpmada kenar boşluğu dengeli. */
function profilHtml(): string {
  return temel(
    `<div style="width:800px;height:800px;background:radial-gradient(circle at 30% 25%, #ff7486 0%, ${MARKA} 45%, ${MARKA_KOYU} 100%);display:flex;align-items:center;justify-content:center">
      ${buyutec(740, false)}
    </div>`,
    800,
    800
  );
}

function bannerHtml(): string {
  // Güvenli alan dışına (yalnızca TV/masaüstünde görünür) dekoratif format çipleri.
  const cipler = [
    ["📋 Liste", 150, 250, -8],
    ["🧠 Quiz", 1720, 230, 7],
    ["🤯 Bunu Bilmiyordun", 120, 860, 6],
    ["✨ Kişilik Testi", 1640, 880, -6],
    ["🏛️ Tarih", 110, 560, -4],
    ["🔬 Bilim", 1740, 560, 5],
  ] as const;
  return temel(
    `<div style="position:relative;width:2048px;height:1152px;background:${ZEMIN};overflow:hidden">
      <div style="position:absolute;inset:0;background:
        radial-gradient(900px 600px at 0% 0%, rgba(255,79,100,.22), transparent 70%),
        radial-gradient(900px 600px at 100% 100%, rgba(255,79,100,.20), transparent 70%)"></div>
      <div style="position:absolute;inset:0;background-image:radial-gradient(rgba(32,26,28,.07) 2px, transparent 2px);background-size:36px 36px"></div>
      ${cipler
        .map(
          ([metin, x, y, aci]) =>
            `<div style="position:absolute;left:${x}px;top:${y}px;transform:rotate(${aci}deg);background:#fff;border-radius:999px;padding:18px 34px;font-size:34px;font-weight:700;color:${MUREKKEP};box-shadow:0 10px 30px rgba(32,26,28,.10)">${metin}</div>`
        )
        .join("")}

      <!-- Güvenli alan: 1235x338, ortada -->
      <div style="position:absolute;left:406px;top:407px;width:1235px;height:338px;display:flex;align-items:center;justify-content:center;gap:44px">
        ${buyutec(210)}
        <div>
          <div style="font-size:124px;font-weight:800;letter-spacing:-4px;line-height:1;color:${MUREKKEP}">sos<span style="color:${MARKA}">yektif</span></div>
          <div style="margin-top:18px;font-size:38px;font-weight:600;color:${MUREKKEP};opacity:.78">Gündemi sosyektif bakış açısından izle</div>
          <div style="margin-top:14px;display:inline-block;background:${MARKA};color:#fff;border-radius:999px;padding:8px 26px;font-size:30px;font-weight:700">Her gün yeni Shorts · sosyektif.com</div>
        </div>
      </div>
    </div>`,
    2048,
    1152
  );
}

async function render(html: string, en: number, boy: number): Promise<Buffer> {
  const tarayici = await tarayiciAc();
  try {
    const sayfa = await tarayici.newPage({ viewport: { width: en, height: boy }, deviceScaleFactor: 1 });
    await sayfa.setContent(html, { waitUntil: "load" });
    await sayfa.evaluate("document.fonts.ready");
    return await sayfa.screenshot({ type: "png" });
  } finally {
    await tarayici.close();
  }
}

await mkdir(cikis, { recursive: true });
const profil = await render(profilHtml(), 800, 800);
await writeFile(path.join(cikis, "youtube-profil-800.png"), profil);
await writeFile(path.join(cikis, "youtube-profil-98.png"), await sharp(profil).resize(98, 98).png().toBuffer());
const banner = await render(bannerHtml(), 2048, 1152);
await writeFile(path.join(cikis, "youtube-banner-2048x1152.jpg"), await sharp(banner).jpeg({ quality: 90 }).toBuffer());
console.log(`Üretildi: ${cikis}`);
process.exit(0);
