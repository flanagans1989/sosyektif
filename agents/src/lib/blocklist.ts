import { readBlocklist } from "./state.js";

export interface BlocklistCheckResult {
  ihlalVar: boolean;
  eslesenTerimler: string[];
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * "vali" kelimesinin "valizinde" içinde yanlışlıkla eşleşmesini önlemek için
 * (PLAN.md'de gerçek testte görülen bir sorun) basit .includes() yerine
 * kelime sınırı kontrolü yapılır. \b Türkçe harflerde (ı, ş, ğ, ü, ö, ç)
 * güvenilir çalışmadığından \p{L}/\p{N} tabanlı unicode lookaround kullanılır
 * — bu, tek kelimeler kadar çok kelimeli ifadeler (ör. "cinsel içerik") için
 * de doğru sınır kontrolü sağlar.
 */
function icerirMi(haystack: string, needle: string): boolean {
  const normalizedHaystack = haystack.toLocaleLowerCase("tr");
  const normalizedNeedle = needle.toLocaleLowerCase("tr");
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])${escapeRegex(normalizedNeedle)}(?![\\p{L}\\p{N}])`,
    "u"
  );
  return pattern.test(normalizedHaystack);
}

/**
 * Bir metni kara listeye karşı tarar.
 * - Varsayılan: konu listesi + kesin yasak kelimeler (başlıklar için).
 * - sadeceKesinKelimeler: yalnızca kesin yasak kelimeler (içerik gövdesi için;
 *   "saldırı", "ölüm" gibi konu kelimeleri gövdede doğal bağlamda geçebilir).
 */
export async function checkBlocklist(
  text: string,
  secenekler: { sadeceKesinKelimeler?: boolean } = {}
): Promise<BlocklistCheckResult> {
  const blocklist = await readBlocklist();
  const eslesenler: string[] = [];

  if (!secenekler.sadeceKesinKelimeler) {
    for (const konu of blocklist.konular) {
      if (icerirMi(text, konu)) eslesenler.push(konu);
    }
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
