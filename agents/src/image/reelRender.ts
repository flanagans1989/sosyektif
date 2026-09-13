/**
 * Carousel slaytlarından (agents/src/image/social.ts) kısa bir dikey video
 * (Reels/Facebook video) üretir — PLAN.md Bölüm 11.2, "Reels/video ajanı".
 * Reels, düz carousel'e göre Instagram'da çok daha fazla erişim alıyor.
 *
 * ffmpeg GitHub Actions ubuntu-latest runner'ında önyüklü geliyor, ek kurulum
 * gerekmiyor (yerelde de macOS/Linux'ta genelde kurulu; Windows'ta yoksa bu
 * fonksiyon hata verir, R5 deseniyle çağıran taraf zaten try/catch içinde).
 *
 * Sığdırma stratejisi: slaytlar zaten 1080×1350 (4:5) — Reels'in tercih
 * ettiği 1080×1920 (9:16) tuvale ortalanıp üstte/altta siyah şerit ile
 * yerleştiriliyor (kırpma yok, hiçbir görsel bilgi kaybolmuyor).
 */
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const REEL_GENISLIK = 1080;
const REEL_YUKSEKLIK = 1920;
/** Her slayt kaç saniye ekranda kalsın (10 slaytta ~28sn, Reels için ideal aralıkta). */
const SANIYE_PER_SLAYT = 2.8;

function ffmpegCalistir(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const surec = spawn("ffmpeg", args);
    let stderr = "";
    surec.stderr.on("data", (veri) => (stderr += veri.toString()));
    surec.on("error", (err) =>
      reject(new Error(`[reel] ffmpeg başlatılamadı (kurulu değil mi?): ${err.message}`))
    );
    surec.on("close", (kod) => {
      if (kod === 0) resolve();
      else reject(new Error(`[reel] ffmpeg hata verdi (kod ${kod}):\n${stderr.slice(-2000)}`));
    });
  });
}

/**
 * @param slaytlar JPEG buffer'ları, sırayla (htmlSlaytlariRenderEt çıktısı).
 * @returns MP4 buffer'ı (H.264 + faststart, sessiz — müzik/ses eklenmiyor,
 *   telif riski almamak için bilinçli olarak boş bırakıldı).
 */
export async function slaytlardanReelUret(slaytlar: Buffer[]): Promise<Buffer> {
  if (slaytlar.length === 0) throw new Error("[reel] slayt yok");

  const gecici = await mkdtemp(path.join(os.tmpdir(), "sosyektif-reel-"));
  try {
    for (const [i, slayt] of slaytlar.entries()) {
      await writeFile(path.join(gecici, `${String(i).padStart(3, "0")}.jpg`), slayt);
    }
    const ciktiYolu = path.join(gecici, "reel.mp4");

    await ffmpegCalistir([
      "-y",
      "-framerate", String(1 / SANIYE_PER_SLAYT),
      "-i", path.join(gecici, "%03d.jpg"),
      "-vf",
      `scale=${REEL_GENISLIK}:${REEL_YUKSEKLIK}:force_original_aspect_ratio=decrease,` +
        `pad=${REEL_GENISLIK}:${REEL_YUKSEKLIK}:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p`,
      "-r", "30",
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      ciktiYolu,
    ]);

    return await readFile(ciktiYolu);
  } finally {
    await rm(gecici, { recursive: true, force: true });
  }
}
