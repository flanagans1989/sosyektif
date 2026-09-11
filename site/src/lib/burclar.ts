/**
 * Bu liste agents/src/lib/burclar.ts ile BİREBİR uyumlu tutulmalıdır (anahtar
 * sırası ve isimleri) — biri değişirse diğeri de güncellenmeli.
 */
export interface BurcBilgi {
  isim: string;
  emoji: string;
  tarihAraligi: string;
  element: 'Ateş' | 'Toprak' | 'Hava' | 'Su';
  gezegen: string;
  nitelik: 'Öncü' | 'Sabit' | 'Değişken';
  ozellikler: readonly string[];
}

export const BURCLAR = {
  koc: { isim: 'Koç', emoji: '♈', tarihAraligi: '21 Mart – 19 Nisan', element: 'Ateş', gezegen: 'Mars', nitelik: 'Öncü', ozellikler: ['cesur', 'enerjik', 'girişken', 'sabırsız'] },
  boga: { isim: 'Boğa', emoji: '♉', tarihAraligi: '20 Nisan – 20 Mayıs', element: 'Toprak', gezegen: 'Venüs', nitelik: 'Sabit', ozellikler: ['sadık', 'sabırlı', 'keyfine düşkün', 'inatçı'] },
  ikizler: { isim: 'İkizler', emoji: '♊', tarihAraligi: '21 Mayıs – 20 Haziran', element: 'Hava', gezegen: 'Merkür', nitelik: 'Değişken', ozellikler: ['meraklı', 'konuşkan', 'esprili', 'kararsız'] },
  yengec: { isim: 'Yengeç', emoji: '♋', tarihAraligi: '21 Haziran – 22 Temmuz', element: 'Su', gezegen: 'Ay', nitelik: 'Öncü', ozellikler: ['şefkatli', 'koruyucu', 'sezgisel', 'alıngan'] },
  aslan: { isim: 'Aslan', emoji: '♌', tarihAraligi: '23 Temmuz – 22 Ağustos', element: 'Ateş', gezegen: 'Güneş', nitelik: 'Sabit', ozellikler: ['cömert', 'özgüvenli', 'yaratıcı', 'ilgi seven'] },
  basak: { isim: 'Başak', emoji: '♍', tarihAraligi: '23 Ağustos – 22 Eylül', element: 'Toprak', gezegen: 'Merkür', nitelik: 'Değişken', ozellikler: ['titiz', 'çalışkan', 'analitik', 'eleştirel'] },
  terazi: { isim: 'Terazi', emoji: '♎', tarihAraligi: '23 Eylül – 22 Ekim', element: 'Hava', gezegen: 'Venüs', nitelik: 'Öncü', ozellikler: ['diplomatik', 'zarif', 'adil', 'kararsız'] },
  akrep: { isim: 'Akrep', emoji: '♏', tarihAraligi: '23 Ekim – 21 Kasım', element: 'Su', gezegen: 'Plüton ve Mars', nitelik: 'Sabit', ozellikler: ['tutkulu', 'kararlı', 'gizemli', 'kıskanç'] },
  yay: { isim: 'Yay', emoji: '♐', tarihAraligi: '22 Kasım – 21 Aralık', element: 'Ateş', gezegen: 'Jüpiter', nitelik: 'Değişken', ozellikler: ['özgür ruhlu', 'iyimser', 'maceracı', 'patavatsız'] },
  oglak: { isim: 'Oğlak', emoji: '♑', tarihAraligi: '22 Aralık – 19 Ocak', element: 'Toprak', gezegen: 'Satürn', nitelik: 'Öncü', ozellikler: ['disiplinli', 'sorumlu', 'hırslı', 'mesafeli'] },
  kova: { isim: 'Kova', emoji: '♒', tarihAraligi: '20 Ocak – 18 Şubat', element: 'Hava', gezegen: 'Uranüs ve Satürn', nitelik: 'Sabit', ozellikler: ['özgün', 'bağımsız', 'yenilikçi', 'aykırı'] },
  balik: { isim: 'Balık', emoji: '♓', tarihAraligi: '19 Şubat – 20 Mart', element: 'Su', gezegen: 'Neptün ve Jüpiter', nitelik: 'Değişken', ozellikler: ['hayalperest', 'empatik', 'sanatsal', 'dağınık'] },
} as const satisfies Record<string, BurcBilgi>;

export type BurcAnahtari = keyof typeof BURCLAR;
export const BURC_ANAHTARLARI = Object.keys(BURCLAR) as BurcAnahtari[];

export interface GunlukYorum {
  yorum: string;
  sansliSayi: number;
  sansliRenk: string;
}

export interface HaftalikYorum {
  genel: string;
  ask: string;
  kariyer: string;
}

export interface UyumVerisi {
  puan: number;
  ozet: string;
  ask: string;
  arkadaslik: string;
  is: string;
}

/**
 * Uyum sayfasının kanonik anahtarı: sırada önce gelen burç başta
 * ("akrep-koc" değil "koc-akrep"). agents/src/orchestrator/burcUyum.ts ile aynı kural.
 */
export function uyumAnahtari(a: BurcAnahtari, b: BurcAnahtari): string {
  return BURC_ANAHTARLARI.indexOf(a) <= BURC_ANAHTARLARI.indexOf(b) ? `${a}-${b}` : `${b}-${a}`;
}

export function uyumEtiketi(puan: number): string {
  if (puan >= 80) return 'Çok uyumlu';
  if (puan >= 60) return 'Uyumlu';
  if (puan >= 45) return 'Emek ister';
  return 'Zorlu ama öğretici';
}

/** "2026-09-11" → "11 Eylül 2026" */
export function tarihEtiketi(gun: string): string {
  return new Date(`${gun}T00:00:00Z`).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Haftanın Pazartesi'si → "7 – 13 Eylül" ya da "29 Eylül – 5 Ekim" */
export function haftaEtiketi(pazartesi: string): string {
  const bas = new Date(`${pazartesi}T00:00:00Z`);
  const son = new Date(bas);
  son.setUTCDate(son.getUTCDate() + 6);
  const bicim = (d: Date, ayli: boolean) =>
    d.toLocaleDateString('tr-TR', { day: 'numeric', ...(ayli ? { month: 'long' as const } : {}), timeZone: 'UTC' });
  return `${bicim(bas, bas.getUTCMonth() !== son.getUTCMonth())} – ${bicim(son, true)}`;
}
