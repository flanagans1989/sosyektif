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

/** Bitcoin'in son 7 günlük saatlik TL fiyatları (CoinGecko). */
export async function bitcoinHaftalik(): Promise<number[]> {
  const res = await fetch('https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=try&days=7');
  if (!res.ok) throw new Error(`coingecko grafik ${res.status}`);
  const veri = (await res.json()) as { prices: [number, number][] };
  return veri.prices.map(([, fiyat]) => fiyat);
}

export function tlBicimle(deger: number): string {
  const ondalik = deger >= 1000 ? 0 : deger >= 1 ? 2 : 6;
  return deger.toLocaleString('tr-TR', { minimumFractionDigits: Math.min(ondalik, 2), maximumFractionDigits: ondalik });
}

export function yuzdeBicimle(degisim: number): string {
  return `${degisim < 0 ? '▼' : '▲'} %${Math.abs(degisim).toFixed(2).replace('.', ',')}`;
}
