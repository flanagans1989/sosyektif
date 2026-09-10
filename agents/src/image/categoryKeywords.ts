import type { Kategori } from "../lib/schemas.js";

/**
 * Stok görsel aramasında BİLEREK haberin/konunun kendi başlığı değil, sadece
 * kategoriye ait genel bir İngilizce anahtar kelime kullanılır. Bu, gerçek
 * bir kişi/olayla ilgili stok fotoğraf eşleşmesi riskini (kişilik hakları +
 * Pexels lisans ihlali, PLAN.md R10) tasarım gereği ortadan kaldırır —
 * görsel her zaman "kavramsal" kalır, "bu kişi/bu olay" iddiası taşımaz.
 */
export const KATEGORI_ARAMA_KELIMELERI: Record<Kategori, string> = {
  eglence: "celebration party colorful",
  "pop-kultur": "cinema movie theater",
  bilim: "science laboratory research",
  teknoloji: "technology computer futuristic",
  spor: "sports stadium action",
  yasam: "lifestyle nature calm",
  tarih: "ancient history architecture",
};
