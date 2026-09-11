/**
 * Bu liste agents/src/lib/burclar.ts ile BİREBİR uyumlu tutulmalıdır (anahtar
 * sırası ve isimleri) — biri değişirse diğeri de güncellenmeli.
 */
export interface BurcBilgi {
  isim: string;
  emoji: string;
  tarihAraligi: string;
}

export const BURCLAR = {
  koc: { isim: 'Koç', emoji: '♈', tarihAraligi: '21 Mart – 19 Nisan' },
  boga: { isim: 'Boğa', emoji: '♉', tarihAraligi: '20 Nisan – 20 Mayıs' },
  ikizler: { isim: 'İkizler', emoji: '♊', tarihAraligi: '21 Mayıs – 20 Haziran' },
  yengec: { isim: 'Yengeç', emoji: '♋', tarihAraligi: '21 Haziran – 22 Temmuz' },
  aslan: { isim: 'Aslan', emoji: '♌', tarihAraligi: '23 Temmuz – 22 Ağustos' },
  basak: { isim: 'Başak', emoji: '♍', tarihAraligi: '23 Ağustos – 22 Eylül' },
  terazi: { isim: 'Terazi', emoji: '♎', tarihAraligi: '23 Eylül – 22 Ekim' },
  akrep: { isim: 'Akrep', emoji: '♏', tarihAraligi: '23 Ekim – 21 Kasım' },
  yay: { isim: 'Yay', emoji: '♐', tarihAraligi: '22 Kasım – 21 Aralık' },
  oglak: { isim: 'Oğlak', emoji: '♑', tarihAraligi: '22 Aralık – 19 Ocak' },
  kova: { isim: 'Kova', emoji: '♒', tarihAraligi: '20 Ocak – 18 Şubat' },
  balik: { isim: 'Balık', emoji: '♓', tarihAraligi: '19 Şubat – 20 Mart' },
} as const satisfies Record<string, BurcBilgi>;

export type BurcAnahtari = keyof typeof BURCLAR;
export const BURC_ANAHTARLARI = Object.keys(BURCLAR) as BurcAnahtari[];
