/**
 * Türkiye'deki milli/dini/özel günler takvimini (data/ozel-gunler.json)
 * Trend Ajanı'nın aday havuzuna zamanında ekler. Böylece 23 Nisan, Anneler
 * Günü, Ramazan Bayramı gibi günler için içerik, günün kendisinde değil
 * "oncedenGun" kadar önce üretilip onaya düşer — hem editoryal incelemeye
 * hem de yayın/onay için yeterli süre kalır.
 *
 * Yıllık tekrar: aynı bayram her yıl yeniden işlenebilsin diye konu başlığına
 * yıl eklenir (ör. "23 Nisan Ulusal Egemenlik ve Çocuk Bayramı (2027)").
 * Bu, mevcut "daha önce işlendi mi" kontrolünü (tam metin eşleşmesi) yıl
 * bazında doğal olarak sıfırlar; Vikipedi kaynak arama adımı ise başlığı
 * arama API'siyle çözdüğü için yıl eki bulmayı etkilemez.
 */
import { readOzelGunler, ozelGununHedefTarihi, type OzelGun } from "../lib/state.js";
import type { TrendCandidate } from "../lib/schemas.js";

const GUN_MS = 24 * 60 * 60 * 1000;

export interface OzelGunEslesme {
  gun: OzelGun;
  hedefTarih: Date;
  kalanGun: number;
}

/** Bugüne göre penceredeki (oncedenGun içindeki) tüm özel günleri döner. */
export async function aktifOzelGunler(referans: Date = new Date()): Promise<OzelGunEslesme[]> {
  const gunler = await readOzelGunler();
  const bugun = new Date(referans);
  bugun.setUTCHours(0, 0, 0, 0);

  const sonuc: OzelGunEslesme[] = [];
  for (const gun of gunler) {
    const hedefTarih = ozelGununHedefTarihi(gun, bugun);
    if (!hedefTarih) continue; // "dini" günler için takvim güncellenmemiş olabilir
    const kalanGun = Math.round((hedefTarih.getTime() - bugun.getTime()) / GUN_MS);
    if (kalanGun >= 0 && kalanGun <= gun.oncedenGun) {
      sonuc.push({ gun, hedefTarih, kalanGun });
    }
  }
  return sonuc;
}

export async function gatherOzelGunAdaylari(referans: Date = new Date()): Promise<TrendCandidate[]> {
  const eslesmeler = await aktifOzelGunler(referans);
  return eslesmeler.map(({ gun, hedefTarih }) => {
    const yil = hedefTarih.getUTCFullYear();
    return {
      baslik: `${gun.konuBaslik} (${yil})`,
      kaynak: "ozel-gun" as const,
      // Gün yaklaştıkça ilgi skoru artar; her zaman diğer kaynaklardan öncelikli.
      tahminiIlgi: 1,
      kategoriTahmini: gun.kategori as TrendCandidate["kategoriTahmini"],
      formatOnerisi: gun.formatOnerisi,
    };
  });
}
