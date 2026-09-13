/**
 * Threads/Instagram token'larını Worker'ın KV'sinden okur (PLAN.md Bölüm
 * 11.2). Token'lar agents ortamında (GitHub Actions) doğrudan KV'ye
 * erişemediği için Worker üzerinden okunur — yazma/yenileme Worker'ın
 * kendi saatlik döngüsünde olur, agents tarafı yalnızca okur.
 */
import { optionalEnv } from "./env.js";

const WORKER_URL = "https://sosyektif-telegram-onay.deraks-rental.workers.dev";

export interface MetaToken {
  access_token: string;
  expires_at: number;
  ig_user_id?: string;
  /** Yalnızca Facebook için: Sayfa (Page) ID'si. */
  page_id?: string;
}

export async function getMetaToken(platform: "threads" | "instagram" | "facebook"): Promise<MetaToken | null> {
  const anahtar = optionalEnv("AGENT_PAYLASIM_ANAHTARI");
  if (!anahtar) {
    console.warn("[meta-token] AGENT_PAYLASIM_ANAHTARI yok, token okunamadı");
    return null;
  }
  try {
    const res = await fetch(
      `${WORKER_URL}/meta-token?platform=${platform}&anahtar=${encodeURIComponent(anahtar)}`
    );
    if (res.status === 404) return null;
    if (!res.ok) {
      console.warn(`[meta-token] ${platform} okunamadı: ${res.status}`);
      return null;
    }
    const token = (await res.json()) as MetaToken;
    if (token.expires_at < Date.now()) {
      console.warn(`[meta-token] ${platform} token'ının süresi dolmuş`);
      return null;
    }
    return token;
  } catch (err) {
    console.warn(`[meta-token] ${platform} okuma hatası:`, err);
    return null;
  }
}
