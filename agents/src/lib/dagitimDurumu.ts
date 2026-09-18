/**
 * data/dagitim.json — her canlı içeriğin her sosyal kanaldaki paylaşım durumu
 * (bkz. distribute/kuyruk.ts). Dağıtım kuyruğu, Reels paylaşımı
 * (distribute/reel.ts), sağlık denetimi ve sosyal performans ajanı okur.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { DATA_DIR } from "./paths.js";

export const KANALLAR = ["telegram", "bluesky", "threads", "instagram", "facebook", "youtube"] as const;
export type Kanal = (typeof KANALLAR)[number];

const kanalDurumuSchema = z.object({
  /** ok: paylaşıldı · hata: tekrar denenecek · vazgecildi: çok kez başarısız
   * (kanal düzelince sağlık denetimi geri alır) · bekliyor: henüz denenmedi ·
   * onayda: Reels videosu Telegram onayında · iptal: elle temizlendi, bir daha
   * denenmez ve sağlık denetimi geri almaz (birikmiş işleri silmek için) */
  durum: z.enum(["bekliyor", "ok", "hata", "vazgecildi", "onayda", "iptal"]),
  deneme: z.number().int().default(0),
  id: z.string().optional(),
  sonDeneme: z.string().optional(),
  hata: z.string().optional(),
});
export type KanalDurumu = z.infer<typeof kanalDurumuSchema>;

const icerikDagitimSchema = z.object({
  eklendi: z.string(),
  /** Anahtarlar: KANALLAR + "reel" (video onayı). */
  kanallar: z.record(z.string(), kanalDurumuSchema).default({}),
  /** Reels onayından sonra paylaşılan video gönderilerinin ID'leri. */
  reelIdleri: z.object({ instagram: z.string().optional(), facebook: z.string().optional() }).default({}),
});
export type IcerikDagitim = z.infer<typeof icerikDagitimSchema>;

const dagitimDurumuSchema = z.record(z.string(), icerikDagitimSchema);
export type DagitimDurumu = z.infer<typeof dagitimDurumuSchema>;

export const DAGITIM_DOSYASI = path.join(DATA_DIR, "dagitim.json");

export function bosKayit(): IcerikDagitim {
  return { eklendi: new Date().toISOString(), kanallar: {}, reelIdleri: {} };
}

export async function readDagitimDurumu(): Promise<DagitimDurumu> {
  try {
    return dagitimDurumuSchema.parse(JSON.parse(await readFile(DAGITIM_DOSYASI, "utf-8")));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
}

export async function writeDagitimDurumu(durum: DagitimDurumu): Promise<void> {
  await writeFile(DAGITIM_DOSYASI, JSON.stringify(durum, null, 2) + "\n", "utf-8");
}
