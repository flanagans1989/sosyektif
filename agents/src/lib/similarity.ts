/**
 * Basit n-gram örtüşme skoru — kaynak metinden birebir kopyalamayı
 * yakalamak için (PLAN.md R2). Anlamsal benzerlik ölçmez, sadece
 * kelime dizisi tekrarını yakalar; bu amaç için yeterli ve bağımlılıksız.
 */

function normalize(text: string): string[] {
  return text
    .toLocaleLowerCase("tr")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function ngrams(words: string[], n: number): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i <= words.length - n; i++) {
    set.add(words.slice(i, i + n).join(" "));
  }
  return set;
}

/**
 * @returns 0 (hiç örtüşme yok) ile 1 (üretilen metin kaynağın büyük kısmını
 * birebir içeriyor) arası bir skor.
 */
export function ngramOverlapScore(
  uretilenMetin: string,
  kaynakMetin: string,
  n = 6
): number {
  const uretilenNgrams = ngrams(normalize(uretilenMetin), n);
  const kaynakNgrams = ngrams(normalize(kaynakMetin), n);

  if (uretilenNgrams.size === 0 || kaynakNgrams.size === 0) return 0;

  let ortakSayisi = 0;
  for (const gram of uretilenNgrams) {
    if (kaynakNgrams.has(gram)) ortakSayisi++;
  }

  return ortakSayisi / uretilenNgrams.size;
}
