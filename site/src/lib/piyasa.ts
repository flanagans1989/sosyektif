// Tarayıcı tarafı piyasa verisi: PiyasaSeridi, ana sayfadaki Ekodektif bandı ve
// /ekodektif/ sayfası aynı modülü kullanır. Vite modülü sayfada bir kez yükler,
// böylece aynı sayfadaki bileşenler tek bir istek sonucunu paylaşır.
// Kaynaklar anahtarsız ve CORS'a açık: finans.truncgil.com (döviz/altın),
// CoinGecko public API (kripto). Sunucu, anahtar, maliyet yok.

export interface Fiyat {
  /** Birim başına TL. */
  tl: number;
  /** Günlük yüzde değişim (ör. -0.3). */
  degisim: number;
}

const TRUNCGIL_URL = 'https://finans.truncgil.com/today.json';
const COINGECKO_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=try&include_24hr_change=true';
const TAZELIK_MS = 50_000;

// truncgil sayıları Türkçe biçimde gönderiyor: "6.784,88", "%-0,30".
const trSayi = (metin: string): number =>
  parseFloat(metin.replace(/[%$\s]/g, '').replace(/\./g, '').replace(',', '.'));

async function truncgil(): Promise<Map<string, Fiyat>> {
  const res = await fetch(TRUNCGIL_URL);
  if (!res.ok) throw new Error(`truncgil ${res.status}`);
  const veri = (await res.json()) as Record<string, { Satış?: string; Değişim?: string } | string>;
  const sonuc = new Map<string, Fiyat>();
  for (const [anahtar, oge] of Object.entries(veri)) {
    if (typeof oge !== 'object' || !oge.Satış) continue;
    // "ons" dolar cinsinden geliyor; TL hesaplarına karışmasın.
    if (oge.Satış.includes('$')) continue;
    const tl = trSayi(oge.Satış);
    if (Number.isFinite(tl)) sonuc.set(anahtar, { tl, degisim: trSayi(oge.Değişim ?? '0') || 0 });
  }
  return sonuc;
}

async function coingecko(): Promise<Map<string, Fiyat>> {
  const res = await fetch(COINGECKO_URL);
  if (!res.ok) throw new Error(`coingecko ${res.status}`);
  const veri = (await res.json()) as Record<string, { try: number; try_24h_change?: number }>;
  return new Map(Object.entries(veri).map(([k, v]) => [k, { tl: v.try, degisim: v.try_24h_change ?? 0 }]));
}

let son: { zaman: number; istek: Promise<Map<string, Fiyat>> } | null = null;

/**
 * Tüm fiyatlar (anahtarlar: USD, EUR, GBP, gram-altin, ceyrek-altin, gumus,
 * bitcoin, ethereum, TRY...). İki kaynaktan biri düşerse diğerininkiler döner;
 * ikisi de düşerse boş Map döner.
 */
export function fiyatlariAl(): Promise<Map<string, Fiyat>> {
  if (son && Date.now() - son.zaman < TAZELIK_MS) return son.istek;
  const istek = Promise.allSettled([truncgil(), coingecko()]).then((sonuclar) => {
    const birlesik = new Map<string, Fiyat>([['TRY', { tl: 1, degisim: 0 }]]);
    for (const s of sonuclar) if (s.status === 'fulfilled') s.value.forEach((v, k) => birlesik.set(k, v));
    return birlesik;
  });
  son = { zaman: Date.now(), istek };
  return istek;
}

export function tlBicimle(deger: number): string {
  const ondalik = deger >= 1000 ? 0 : deger >= 1 ? 2 : 6;
  return deger.toLocaleString('tr-TR', { minimumFractionDigits: Math.min(ondalik, 2), maximumFractionDigits: ondalik });
}

export function yuzdeBicimle(degisim: number): string {
  return `${degisim < 0 ? '▼' : '▲'} %${Math.abs(degisim).toFixed(2).replace('.', ',')}`;
}

// ---------------------------------------------------------------------------
// Geçmiş veriler — grafik stüdyosu, zaman makinesi ve ana sayfa bandı için.
// Döviz: Frankfurter (Avrupa Merkez Bankası referans kurları, 2005'ten beri,
// anahtarsız, CORS açık). Altın ve kripto: CoinGecko market_chart (ücretsiz
// katmanda en fazla 365 gün). Gram altın, PAX Gold'un (1 troy ons fiziki
// altına bağlı token) TL fiyatının 31,1035'e bölünmesiyle hesaplanır —
// uluslararası fiyat, kuyumcu fiyatından biraz farklı olabilir.
// ---------------------------------------------------------------------------

export type Varlik = 'USD' | 'EUR' | 'gram-altin' | 'bitcoin' | 'ethereum';
export type Aralik = '7G' | '1A' | '1Y' | '5Y' | 'TUMU';

export interface SeriNoktasi {
  /** Unix ms */
  zaman: number;
  deger: number;
}

export const VARLIK_ARALIKLARI: Record<Varlik, Aralik[]> = {
  USD: ['1A', '1Y', '5Y', 'TUMU'],
  EUR: ['1A', '1Y', '5Y', 'TUMU'],
  'gram-altin': ['7G', '1A', '1Y'],
  bitcoin: ['7G', '1A', '1Y'],
  ethereum: ['7G', '1A', '1Y'],
};

const GUN_MS = 86_400_000;
const TROY_ONS_GRAM = 31.1035;
const ARALIK_GUN: Record<Exclude<Aralik, 'TUMU'>, number> = { '7G': 7, '1A': 30, '1Y': 365, '5Y': 1826 };
const COINGECKO_ID: Record<string, string> = { 'gram-altin': 'pax-gold', bitcoin: 'bitcoin', ethereum: 'ethereum' };

const tarihMetni = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const seriOnbellek = new Map<string, Promise<SeriNoktasi[]>>();

async function frankfurterSeri(para: 'USD' | 'EUR', aralik: Aralik): Promise<SeriNoktasi[]> {
  const baslangic = aralik === 'TUMU' ? '2005-01-15' : tarihMetni(Date.now() - ARALIK_GUN[aralik] * GUN_MS);
  const res = await fetch(`https://api.frankfurter.dev/v1/${baslangic}..?from=${para}&to=TRY`);
  if (!res.ok) throw new Error(`frankfurter ${res.status}`);
  const veri = (await res.json()) as { rates: Record<string, { TRY: number }> };
  return Object.entries(veri.rates)
    .map(([tarih, r]) => ({ zaman: Date.parse(`${tarih}T12:00:00Z`), deger: r.TRY }))
    .filter((n) => n.zaman >= Date.parse(`${baslangic}T00:00:00Z`));
}

async function coingeckoSeri(varlik: string, aralik: Aralik): Promise<SeriNoktasi[]> {
  const gun = aralik === 'TUMU' ? 365 : Math.min(ARALIK_GUN[aralik], 365);
  const res = await fetch(
    `https://api.coingecko.com/api/v3/coins/${COINGECKO_ID[varlik]}/market_chart?vs_currency=try&days=${gun}`
  );
  if (!res.ok) throw new Error(`coingecko grafik ${res.status}`);
  const veri = (await res.json()) as { prices: [number, number][] };
  const bolen = varlik === 'gram-altin' ? TROY_ONS_GRAM : 1;
  return veri.prices.map(([zaman, deger]) => ({ zaman, deger: deger / bolen }));
}

/** Seçilen varlığın geçmiş TL fiyatları; aynı sayfa ömründe önbelleklenir. */
export function gecmisSeri(varlik: Varlik, aralik: Aralik): Promise<SeriNoktasi[]> {
  const anahtar = `${varlik}:${aralik}`;
  let istek = seriOnbellek.get(anahtar);
  if (!istek) {
    istek = varlik === 'USD' || varlik === 'EUR' ? frankfurterSeri(varlik, aralik) : coingeckoSeri(varlik, aralik);
    istek.catch(() => seriOnbellek.delete(anahtar));
    seriOnbellek.set(anahtar, istek);
  }
  return istek;
}

/** Bitcoin'in son 7 günlük TL fiyatları (ana sayfa bandı). */
export async function bitcoinHaftalik(): Promise<number[]> {
  return (await gecmisSeri('bitcoin', '7G')).map((n) => n.deger);
}

/**
 * Bir tarihteki Avrupa Merkez Bankası referans kuru (o gün tatilse önceki iş
 * günü) ve bugünkü referans kur. Zaman makinesi iki ucu da aynı kaynaktan
 * alır ki karşılaştırma tutarlı olsun.
 */
export async function referansKur(para: 'USD' | 'EUR', tarih: string | 'latest'): Promise<{ tarih: string; kur: number }> {
  const res = await fetch(`https://api.frankfurter.dev/v1/${tarih}?from=${para}&to=TRY`);
  if (!res.ok) throw new Error(`frankfurter ${res.status}`);
  const veri = (await res.json()) as { date: string; rates: { TRY: number } };
  return { tarih: veri.date, kur: veri.rates.TRY };
}
