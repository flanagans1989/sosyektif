/**
 * Reels videosunu Worker'ın KV'sine 3 günlüğüne yükler ve herkese açık URL'ini
 * döner (bkz. worker/telegram-onay, /gecici-dosya). Instagram/Facebook videoyu
 * bu URL'den çeker. Git'e commit'lemeye göre farkı: repo geçmişi şişmez
 * (~12MB/video) ve süre dolunca dosya kendiliğinden silinir.
 *
 * @returns URL ya da Worker bu uç noktayı henüz desteklemiyorsa/hata varsa null
 *   (çağıran eski yönteme — git + Cloudflare Pages — düşer).
 */
import { optionalEnv } from "./env.js";

const WORKER_URL = "https://sosyektif-telegram-onay.deraks-rental.workers.dev";

export async function geciciVideoYukle(ad: string, video: Buffer): Promise<string | null> {
  const anahtar = optionalEnv("AGENT_PAYLASIM_ANAHTARI");
  if (!anahtar) return null;
  try {
    const res = await fetch(
      `${WORKER_URL}/gecici-dosya?` + new URLSearchParams({ ad, anahtar }),
      { method: "PUT", headers: { "Content-Type": "video/mp4" }, body: new Uint8Array(video) }
    );
    if (!res.ok) {
      console.warn(`[gecici-dosya] yüklenemedi (${res.status}), git yöntemine düşülüyor`);
      return null;
    }
    const { url } = (await res.json()) as { url: string };
    // Gerçekten sunulabildiğini doğrula (eski Worker 200 "ok" dönebilir).
    const kontrol = await fetch(url, { method: "HEAD" });
    return kontrol.ok && kontrol.headers.get("content-type")?.startsWith("video/") ? url : null;
  } catch (err) {
    console.warn("[gecici-dosya] hata, git yöntemine düşülüyor:", err instanceof Error ? err.message : err);
    return null;
  }
}
