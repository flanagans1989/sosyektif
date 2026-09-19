/**
 * Reels videosunu üretir (PLAN.md Bölüm 11.9): reelSablon.ts'teki CSS
 * animasyonlu HTML sayfası headless Chromium'da açılır, tüm animasyonlar
 * durdurulur ve zaman her karede elle ilerletilerek (Web Animations API,
 * `currentTime`) ekran görüntüsü alınır — kare atlaması/takılma olmaz,
 * sonuç her çalıştırmada birebir aynıdır. Kareler ffmpeg'e boru hattıyla
 * verilip yüksek kaliteli H.264 olarak kodlanır.
 *
 * Neden Playwright'ın kendi video kaydı değil: düşük bit hızlı VP8 üretiyor
 * ve kayıt gerçek zamanlı olduğu için yavaş makinede kare düşürüyor.
 *
 * ffmpeg: `ffmpeg-static` paketiyle gelen ikili dosya (yerelde Windows'ta da
 * kurulum gerekmez); bulunamazsa sistemdeki `ffmpeg` denenir.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { REPO_ROOT, SITE_DIR } from "../lib/paths.js";
import { FORMAT_EMOJI, FORMAT_ETIKETLERI_TR, KATEGORI_EMOJI } from "../lib/formatLabels.js";
import type { Post } from "../lib/schemas.js";
import { SIGDIR_BETIGI, tarayiciAc } from "./htmlRender.js";
import { KATEGORI_ETIKETLERI } from "./social.js";
import { REEL_GENISLIK, REEL_YUKSEKLIK, reelBelgesi, type ReelBaglami } from "./reelSablon.js";

export const REEL_FPS = 30;

/** Instagram Reels kapağı için videodan alınacak an (ms). 0. kare siyah (arka plan animasyonla
 * giriyor → Instagram'da kapak siyah görünüyordu); kapak sahnesi ~2400ms'de tam oturuyor
 * (fotoğraf + kategori + başlık) ve 3450ms'de çıkışa başlıyor. */
export const REEL_KAPAK_MS = 2600;

/**
 * Metin sığdırma (data-sigdir) animasyonların BİTİŞ durumunda ölçülmeli:
 * başlangıçta kelimeler translateY ile aşağıda duruyor ve transform taşması
 * scrollHeight'a yansıyıp başlıkları gereksiz yere en küçük boyuta
 * indiriyordu. Önce her şey son haline getirilip ölçülür, sonra 0'a dönülür.
 */
const HAZIRLA = `(() => {
  window.__anim = document.getAnimations();
  window.__anim.forEach(x => {
    x.pause();
    const son = x.effect.getComputedTiming().endTime;
    if (Number.isFinite(son)) x.currentTime = son;
  });
  ${SIGDIR_BETIGI}
  window.__anim.forEach(x => { x.currentTime = 0; });
})()`;

function ffmpegYolu(): string {
  try {
    const yol = createRequire(import.meta.url)("ffmpeg-static") as string | null;
    if (yol && existsSync(yol)) return yol;
  } catch {
    // paket yok — sistem ffmpeg'ine düş
  }
  return "ffmpeg";
}

async function fotograflar(kapakGorseli: string): Promise<{ keskin: string | null; bulanik: string | null }> {
  const dosya = kapakGorseli.startsWith("/") ? path.join(SITE_DIR, "public", kapakGorseli) : "";
  if (!dosya || !existsSync(dosya)) return { keskin: null, bulanik: null };
  try {
    const kaynak = await readFile(dosya);
    const keskin = await sharp(kaynak)
      .resize(1400, 788, { fit: "cover", withoutEnlargement: false })
      .jpeg({ quality: 90 })
      .toBuffer();
    // Arka plan: dikey kırpılıp bulanıklaştırılmış ve koyulaştırılmış —
    // büyütmeden kaynaklanan bulanıklık burada zaten istenen görüntü.
    const bulanik = await sharp(kaynak)
      .resize(540, 960, { fit: "cover" })
      .blur(22)
      .modulate({ brightness: 0.8, saturation: 1.25 })
      .jpeg({ quality: 80 })
      .toBuffer();
    return {
      keskin: `data:image/jpeg;base64,${keskin.toString("base64")}`,
      bulanik: `data:image/jpeg;base64,${bulanik.toString("base64")}`,
    };
  } catch {
    return { keskin: null, bulanik: null };
  }
}

/** Film greni dokusu — rastgele gri gürültü, sahne üstünde düşük opaklıkla kayar. */
async function grenDokusu(): Promise<string> {
  const boyut = 256;
  const ham = Buffer.alloc(boyut * boyut);
  for (let i = 0; i < ham.length; i++) ham[i] = Math.floor(Math.random() * 256);
  const png = await sharp(ham, { raw: { width: boyut, height: boyut, channels: 1 } }).png().toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

export async function reelBaglami(post: Post): Promise<ReelBaglami> {
  const { keskin, bulanik } = await fotograflar(post.kapakGorseli);
  return {
    fotoDataUri: keskin,
    bulanikFotoDataUri: bulanik,
    grenDataUri: await grenDokusu(),
    kategoriEtiketi: KATEGORI_ETIKETLERI[post.kategori] ?? post.kategori,
    kategoriEmoji: KATEGORI_EMOJI[post.kategori] ?? "🔍",
    formatEtiketi: FORMAT_ETIKETLERI_TR[post.format],
    formatEmoji: FORMAT_EMOJI[post.format],
  };
}

/**
 * Reels videosunu (1080×1920, 30fps, H.264) üretir.
 * @param muzik Verilirse (muzik.json dosya adı) videoya gömülür; `null` sessiz.
 */
export async function reelUret(post: Post, muzik: string | null = null): Promise<{ video: Buffer; sureMs: number }> {
  const { html, sureMs } = reelBelgesi(await reelBaglami(post), post);
  const gecici = await mkdtemp(path.join(os.tmpdir(), "sosyektif-reel-"));
  const cikti = path.join(gecici, "reel.mp4");

  const tarayici = await tarayiciAc();
  try {
    const sayfa = await tarayici.newPage({
      viewport: { width: REEL_GENISLIK, height: REEL_YUKSEKLIK },
      deviceScaleFactor: 1,
    });
    await sayfa.setContent(html, { waitUntil: "load" });
    await sayfa.evaluate("document.fonts.ready");
    await sayfa.evaluate(HAZIRLA);
    const cdp = await sayfa.context().newCDPSession(sayfa);

    const ffmpeg = spawn(ffmpegYolu(), [
      "-y",
      "-f", "image2pipe",
      "-framerate", String(REEL_FPS),
      "-c:v", "mjpeg",
      "-i", "-",
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "20",
      // Cloudflare Pages dosya başına 25MB, Telegram bot 50MB kabul ediyor —
      // bit hızı tavanı 30sn'lik videoyu ~18MB altında tutar. Film greni bu
      // yüzden hareketsiz: her karede değişen gren sıkıştırmayı bozup ilk
      // denemede 31sn'yi 212MB yapmıştı.
      "-maxrate", "4500k",
      "-bufsize", "9000k",
      "-profile:v", "high",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      cikti,
    ]);
    let stderr = "";
    ffmpeg.stderr.on("data", (v) => (stderr += v.toString()));
    const bitti = new Promise<void>((resolve, reject) => {
      ffmpeg.on("error", (err) => reject(new Error(`[reel] ffmpeg başlatılamadı: ${err.message}`)));
      ffmpeg.on("close", (kod) =>
        kod === 0 ? resolve() : reject(new Error(`[reel] ffmpeg hata verdi (kod ${kod}):\n${stderr.slice(-1500)}`))
      );
    });

    const kareSayisi = Math.ceil((sureMs / 1000) * REEL_FPS);
    for (let i = 0; i < kareSayisi; i++) {
      const t = (i * 1000) / REEL_FPS;
      await sayfa.evaluate(`window.__anim.forEach(x => { x.currentTime = ${t}; })`);
      const { data } = (await cdp.send("Page.captureScreenshot", {
        format: "jpeg",
        quality: 94,
        optimizeForSpeed: true,
      })) as { data: string };
      if (!ffmpeg.stdin.write(Buffer.from(data, "base64"))) {
        await new Promise((r) => ffmpeg.stdin.once("drain", r));
      }
    }
    ffmpeg.stdin.end();
    await bitti;
    const sessiz = await readFile(cikti);
    return { video: muzik ? await muzikEkle(sessiz, sureMs, muzik) : sessiz, sureMs };
  } finally {
    await tarayici.close();
    await rm(gecici, { recursive: true, force: true });
  }
}

// ------------------------------------------------------------------ Müzik

const MUZIK_DIR = path.join(REPO_ROOT, "agents", "assets", "muzik");

export interface MuzikParcasi {
  dosya: string;
  ad: string;
  sanatci: string;
  ruhHali: string;
  lisans: string;
  kaynak: string;
}

/**
 * Müzik kütüphanesi (agents/assets/muzik/muzik.json). Instagram'ın kendi
 * müzik kütüphanesi API ile eklenemediği için müzik videoya gömülüyor;
 * telifli parça sesin kapatılmasına/gönderinin kaldırılmasına yol açacağı
 * için yalnızca CC0 (kamu malı, atıf gerektirmeyen) parçalar kullanılıyor —
 * her parçanın kaynağı ve lisansı muzik.json'da.
 */
export async function muzikKutuphanesi(): Promise<MuzikParcasi[]> {
  return JSON.parse(await readFile(path.join(MUZIK_DIR, "muzik.json"), "utf8")) as MuzikParcasi[];
}

/** Aynı içerik her render'da aynı parçayı alır (onaylanan video = paylaşılan video). */
export async function muzikSec(slug: string): Promise<MuzikParcasi | null> {
  const liste = await muzikKutuphanesi().catch(() => []);
  if (!liste.length) return null;
  let h = 0;
  for (const c of slug) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return liste[h % liste.length]!;
}

/**
 * Sessiz videoya müzik ekler: parça videodan kısaysa döngüye alınır, başta
 * yumuşak giriş, sonda 1.8sn'lik çıkış, ses seviyesi sosyal medya
 * standardına (-16 LUFS) normalize edilir. Video yeniden kodlanmaz (hızlı).
 */
export async function muzikEkle(video: Buffer, sureMs: number, muzikDosyasi: string): Promise<Buffer> {
  const gecici = await mkdtemp(path.join(os.tmpdir(), "sosyektif-muzik-"));
  try {
    const giris = path.join(gecici, "sessiz.mp4");
    const cikti = path.join(gecici, "muzikli.mp4");
    await writeFile(giris, video);
    const sn = sureMs / 1000;
    await new Promise<void>((resolve, reject) => {
      const p = spawn(ffmpegYolu(), [
        "-y",
        "-i", giris,
        "-stream_loop", "-1",
        "-i", path.join(MUZIK_DIR, muzikDosyasi),
        "-filter_complex",
        `[1:a]atrim=0:${sn.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.6,` +
          `afade=t=out:st=${Math.max(0, sn - 1.8).toFixed(3)}:d=1.8,loudnorm=I=-16:TP=-1.5:LRA=11[a]`,
        "-map", "0:v:0",
        "-map", "[a]",
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "160k",
        "-ar", "44100",
        "-shortest",
        "-movflags", "+faststart",
        cikti,
      ]);
      let stderr = "";
      p.stderr.on("data", (v) => (stderr += v.toString()));
      p.on("error", reject);
      p.on("close", (kod) =>
        kod === 0 ? resolve() : reject(new Error(`[reel] müzik eklenemedi (kod ${kod}):\n${stderr.slice(-1200)}`))
      );
    });
    return await readFile(cikti);
  } finally {
    await rm(gecici, { recursive: true, force: true });
  }
}

/** Belirli anlardaki kareleri JPEG olarak döner (şablon kontrolü için, video üretmez). */
export async function reelKareleri(post: Post, zamanlarMs: number[]): Promise<{ kareler: Buffer[]; sureMs: number }> {
  const { html, sureMs } = reelBelgesi(await reelBaglami(post), post);
  const tarayici = await tarayiciAc();
  try {
    const sayfa = await tarayici.newPage({ viewport: { width: REEL_GENISLIK, height: REEL_YUKSEKLIK } });
    await sayfa.setContent(html, { waitUntil: "load" });
    await sayfa.evaluate("document.fonts.ready");
    await sayfa.evaluate(HAZIRLA);
    const kareler: Buffer[] = [];
    for (const t of zamanlarMs) {
      await sayfa.evaluate(`window.__anim.forEach(x => { x.currentTime = ${t}; })`);
      kareler.push(await sayfa.screenshot({ type: "jpeg", quality: 85 }));
    }
    return { kareler, sureMs };
  } finally {
    await tarayici.close();
  }
}
