/**
 * Güvenli HTML/JSON yardımcıları. İçerik (yazılar, burç yorumları, günün
 * soruları) LLM'den ve web kaynaklarından üretildiği için sayfalara
 * gömülürken güvenilmez veri sayılır.
 */

/**
 * <script> içine `set:html` ile gömülecek JSON. `JSON.stringify` "</script>"
 * ya da "<!--" dizilerini kaçırmaz; "<" karakterini < yaparak script
 * bloğundan çıkış (XSS) mümkün olmaz. JSON.parse çıktısı değişmez.
 */
export function guvenliJson(veri: unknown): string {
  return JSON.stringify(veri)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** `innerHTML` şablonlarına düz metin gömerken kullanılır. */
export function kacis(metin: unknown): string {
  return String(metin ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
