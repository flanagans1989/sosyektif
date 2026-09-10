import { AtpAgent } from "@atproto/api";
import { optionalEnv } from "./env.js";

export function isBlueskyConfigured(): boolean {
  return (
    optionalEnv("BLUESKY_HANDLE") !== undefined &&
    optionalEnv("BLUESKY_APP_PASSWORD") !== undefined
  );
}

/** Yeni içerik duyurusunu Bluesky'de paylaşır (Dağıtım Ajanı, Faz 1). */
export async function postSkeet(text: string, url: string): Promise<void> {
  const handle = optionalEnv("BLUESKY_HANDLE");
  const password = optionalEnv("BLUESKY_APP_PASSWORD");

  if (!handle || !password) {
    console.warn("[bluesky] hesap bilgisi yok, paylaşım atlandı");
    return;
  }

  const agent = new AtpAgent({ service: "https://bsky.social" });
  await agent.login({ identifier: handle, password });

  // Link kartı olmadan basit metin+URL paylaşımı; Faz 2'de OG kartı eklenebilir.
  await agent.post({
    text: `${text}\n\n${url}`,
    createdAt: new Date().toISOString(),
  });
}
