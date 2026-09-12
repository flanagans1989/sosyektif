/**
 * Türkçe karakterleri ASCII'ye çevirip URL-güvenli slug üretir.
 * agents/src/lib/slug.ts ile aynı mantık (PLAN.md R13) — ikisi ayrı
 * paketlerde yaşadığı için burada küçük bir kopyası tutuluyor.
 */
const TR_MAP: Record<string, string> = {
  ç: 'c', Ç: 'c',
  ğ: 'g', Ğ: 'g',
  ı: 'i', I: 'i',
  İ: 'i',
  ö: 'o', Ö: 'o',
  ş: 's', Ş: 's',
  ü: 'u', Ü: 'u',
};

export function etiketSlugla(input: string): string {
  const asciified = input
    .split('')
    .map((ch) => TR_MAP[ch] ?? ch)
    .join('');

  return asciified
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
