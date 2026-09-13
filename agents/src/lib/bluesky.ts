import { AtpAgent, RichText } from "@atproto/api";
import { optionalEnv } from "./env.js";

export function isBlueskyConfigured(): boolean {
  return (
    optionalEnv("BLUESKY_HANDLE") !== undefined &&
    optionalEnv("BLUESKY_APP_PASSWORD") !== undefined
  );
}

/** Bluesky gönderi sınırı: 300 grafem (emoji tek sayılır, uzunluk karakter değil). */
const MAKS_GRAFEM = 300;

function grafemler(metin: string): string[] {
  return [...new Intl.Segmenter("tr", { granularity: "grapheme" }).segment(metin)].map((s) => s.segment);
}

/**
 * Metni, sona eklenecek link dahil 300 grafeme sığacak şekilde kırpar.
 * 2026-09-13'e kadar Bluesky'de HİÇ gönderi yoktu: başlık + açıklama + link
 * çoğu içerikte sınırı aşıyordu ("grapheme too big (maximum 300, got 301)")
 * ve hata yalnızca tek seferlik bir Telegram mesajında kalıyordu.
 */
export function blueskyMetniHazirla(text: string, url: string): string {
  const ek = `\n\n${url}`;
  const butce = MAKS_GRAFEM - grafemler(ek).length;
  const parcalar = grafemler(text);
  const govde = parcalar.length <= butce ? text : `${parcalar.slice(0, butce - 1).join("").trimEnd()}…`;
  return `${govde}${ek}`;
}

/** Yeni içerik duyurusunu Bluesky'de paylaşır (Dağıtım Ajanı). @returns gönderi URI'si. */
export async function postSkeet(text: string, url: string, kart?: { baslik: string; aciklama: string }): Promise<string | null> {
  const handle = optionalEnv("BLUESKY_HANDLE");
  const password = optionalEnv("BLUESKY_APP_PASSWORD");

  if (!handle || !password) {
    console.warn("[bluesky] hesap bilgisi yok, paylaşım atlandı");
    return null;
  }

  const agent = new AtpAgent({ service: "https://bsky.social" });
  await agent.login({ identifier: handle, password });

  // Link tıklanabilir olsun (facet) ve altında önizleme kartı çıksın (embed).
  const rt = new RichText({ text: blueskyMetniHazirla(text, url) });
  await rt.detectFacets(agent);

  const sonuc = await agent.post({
    text: rt.text,
    facets: rt.facets,
    ...(kart
      ? {
          embed: {
            $type: "app.bsky.embed.external",
            external: { uri: url, title: kart.baslik.slice(0, 300), description: kart.aciklama.slice(0, 1000) },
          },
        }
      : {}),
    langs: ["tr"],
    createdAt: new Date().toISOString(),
  });
  return sonuc.uri;
}
