import { readBlocklist } from "./state.js";

export interface BlocklistCheckResult {
  ihlalVar: boolean;
  eslesenTerimler: string[];
}

function icerirMi(haystack: string, needle: string): boolean {
  return haystack.toLocaleLowerCase("tr").includes(needle.toLocaleLowerCase("tr"));
}

/** Bir metni (başlık + gövde) kara liste konu/kelimelerine karşı tarar. */
export async function checkBlocklist(text: string): Promise<BlocklistCheckResult> {
  const blocklist = await readBlocklist();
  const eslesenler: string[] = [];

  for (const konu of blocklist.konular) {
    if (icerirMi(text, konu)) eslesenler.push(konu);
  }
  for (const kelime of blocklist.kelimeler) {
    if (icerirMi(text, kelime)) eslesenler.push(kelime);
  }

  return { ihlalVar: eslesenler.length > 0, eslesenTerimler: eslesenler };
}

/** Trend Ajanı'nın navigasyon/gündelik arama terimlerini elemesi için (PLAN.md R6). */
export async function isNavigationNoise(baslik: string): Promise<boolean> {
  const blocklist = await readBlocklist();
  return blocklist.navigasyonKelimeleri.some((kelime) => icerirMi(baslik, kelime));
}
