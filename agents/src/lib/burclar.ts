/**
 * Bu liste site/src/lib/burclar.ts ile BİREBİR uyumlu tutulmalıdır (anahtar
 * sırası ve isimleri) — biri değişirse diğeri de güncellenmeli.
 */
export const BURC_ANAHTARLARI = [
  "koc",
  "boga",
  "ikizler",
  "yengec",
  "aslan",
  "basak",
  "terazi",
  "akrep",
  "yay",
  "oglak",
  "kova",
  "balik",
] as const;

export type BurcAnahtari = (typeof BURC_ANAHTARLARI)[number];

export const BURC_ISIMLERI: Record<BurcAnahtari, string> = {
  koc: "Koç",
  boga: "Boğa",
  ikizler: "İkizler",
  yengec: "Yengeç",
  aslan: "Aslan",
  basak: "Başak",
  terazi: "Terazi",
  akrep: "Akrep",
  yay: "Yay",
  oglak: "Oğlak",
  kova: "Kova",
  balik: "Balık",
};
