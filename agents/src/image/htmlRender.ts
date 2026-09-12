/**
 * HTML/CSS şablonlarını gerçek bir tarayıcıda (headless Chromium) render edip
 * JPEG'e çevirir (PLAN.md Bölüm 11.2).
 *
 * Neden SVG + sharp değil: SVG'de metin ölçülemiyor (satır başına harf sayısı
 * tahminiyle kırılıyordu), uzun başlıklar butonların üstüne biniyor, flexbox/
 * gölge/bulanıklık yok, emoji fontsuz ortamda bozuk çıkıyordu (2026-09-13
 * kullanıcı geri bildirimi: "orantılar doğru değil, yeterince zengin değil").
 * Tarayıcıda metin gerçek ölçüyle yerleşir; sığmayan metin `data-sigdir`
 * işaretli kutularda otomatik küçültülür.
 *
 * Kurulum: GitHub Actions'ta `npx playwright-core install --with-deps chromium`
 * + `fonts-noto-color-emoji` (bkz. pipeline.yml). Yerelde paketli Chromium
 * yoksa sistemdeki Google Chrome kullanılır.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser } from "playwright-core";
import { REPO_ROOT } from "../lib/paths.js";

const FONT_DIR = path.join(REPO_ROOT, "agents", "assets", "fonts");
const FONT_AGIRLIKLARI: [string, number][] = [
  ["Poppins-Medium.ttf", 500],
  ["Poppins-SemiBold.ttf", 600],
  ["Poppins-Bold.ttf", 700],
  ["Poppins-ExtraBold.ttf", 800],
];

let fontCssOnbellek: string | null = null;

/** Fontlar base64 gömülür — render sırasında ağ ya da sistem fontu gerekmez. */
export function fontFaceCss(): string {
  if (fontCssOnbellek) return fontCssOnbellek;
  fontCssOnbellek = FONT_AGIRLIKLARI.map(([dosya, agirlik]) => {
    const b64 = readFileSync(path.join(FONT_DIR, dosya)).toString("base64");
    return `@font-face{font-family:"Poppins";font-weight:${agirlik};font-style:normal;src:url(data:font/ttf;base64,${b64}) format("truetype");}`;
  }).join("\n");
  return fontCssOnbellek;
}

/**
 * Sığmayan metni küçültür: `data-sigdir="min"` taşıyan her kutu, içeriği
 * kutunun yüksekliğine sığana kadar 2px adımlarla küçülür (min değerde durur).
 */
const SIGDIR_BETIGI = `
  for (const el of document.querySelectorAll("[data-sigdir]")) {
    const min = Number(el.dataset.sigdir) || 20;
    let boyut = parseFloat(getComputedStyle(el).fontSize);
    // Yalnızca yükseklik (metin zaten satıra kırılıyor). Tolerans yazı boyutunun
    // yarısı: Poppins'in glif kutusu dar satır aralığından taşıyor ve bu küçük
    // taşma scrollHeight'a yansıyıp başlıkları gereksiz yere en küçüğe
    // indiriyordu. Gerçek taşma en az bir satır (>1em) olduğu için yine yakalanır.
    while (el.scrollHeight > el.clientHeight + boyut * 0.5 && boyut > min) {
      boyut -= 2;
      el.style.fontSize = boyut + "px";
    }
  }
`;

async function tarayiciAc(): Promise<Browser> {
  try {
    return await chromium.launch();
  } catch (err) {
    // Paketli Chromium kurulu değil (ör. yerel geliştirme) — sistem Chrome'unu dene.
    try {
      return await chromium.launch({ channel: "chrome" });
    } catch {
      throw err;
    }
  }
}

/** Her biri tam bir HTML belgesi olan slaytları sırayla JPEG'e çevirir. */
export async function htmlSlaytlariRenderEt(
  belgeler: string[],
  { genislik, yukseklik }: { genislik: number; yukseklik: number }
): Promise<Buffer[]> {
  const tarayici = await tarayiciAc();
  try {
    const sayfa = await tarayici.newPage({
      viewport: { width: genislik, height: yukseklik },
      deviceScaleFactor: 1,
    });
    const ciktilar: Buffer[] = [];
    for (const belge of belgeler) {
      await sayfa.setContent(belge, { waitUntil: "load" });
      await sayfa.evaluate("document.fonts.ready");
      await sayfa.evaluate(SIGDIR_BETIGI);
      ciktilar.push(await sayfa.screenshot({ type: "jpeg", quality: 92 }));
    }
    return ciktilar;
  } finally {
    await tarayici.close();
  }
}
