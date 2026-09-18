import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { PATHS, DATA_DIR } from "./paths.js";

// ---------------------------------------------------------------------------
// config.json — acil durdurma anahtarı, hacim ve eşik ayarları (PLAN.md §7, R12)
// ---------------------------------------------------------------------------
export const configSchema = z.object({
  paused: z.boolean().default(false),
  pausedReason: z.string().optional(),
  /**
   * Faz 1b prova modu: skor ne olursa olsun hiçbir içerik otomatik
   * yayınlanmaz/paylaşılmaz; geçen her içerik taslak olarak onaya düşer.
   * Güvenli varsayılan: açık.
   */
  provaModu: z.boolean().default(true),
  gunlukHedefIcerikSayisi: z.number().int().min(0).default(2),
  otomatikYayinEsigi: z.number().min(0).max(1).default(0.85),
  onayaDusEsigi: z.number().min(0).max(1).default(0.6),
  ardisikBasarisizCalismaLimiti: z.number().int().min(1).default(3),
  ardisikBasarisizCalisma: z.number().int().min(0).default(0),
  /**
   * Reels/video ajanı (PLAN.md Bölüm 11.9). Açıkken dağıtım kuyruğu her YENİ
   * içerik için dikey video üretip "✅/❌" butonlarıyla admin Telegram'ına
   * gönderir; ✅ ile Instagram Reels + Facebook video + YouTube Shorts olarak
   * paylaşılır. Carousel/metin paylaşımlarını ETKİLEMEZ (onlar her zaman gider).
   * 2026-09-13'te açıldı (kullanıcı: "her içeriği paylaşalım", YouTube çalışmalı).
   */
  reelsAktif: z.boolean().default(false),
  /**
   * Elle kapatılan sosyal kanallar (ör. hesap Meta incelemesindeyken): dağıtım
   * kuyruğu ve sağlık denetimi o kanalın API'sine HİÇ istek atmaz; paylaşımlar
   * "bekliyor"da kalır ve kanal listeden çıkarılınca paylaşılır. Değerler:
   * telegram | bluesky | threads | instagram | facebook | youtube.
   */
  kapaliKanallar: z.array(z.string()).default([]),
});
export type Config = z.infer<typeof configSchema>;

export async function readConfig(): Promise<Config> {
  const raw = await readFile(PATHS.config, "utf-8");
  return configSchema.parse(JSON.parse(raw));
}

export async function writeConfig(config: Config): Promise<void> {
  await writeFile(PATHS.config, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

// ---------------------------------------------------------------------------
// blocklist.json — hassas konu/kelime kara listesi (PLAN.md §5)
// ---------------------------------------------------------------------------
export const blocklistSchema = z.object({
  konular: z.array(z.string()),
  kelimeler: z.array(z.string()),
  navigasyonKelimeleri: z.array(z.string()),
});
export type Blocklist = z.infer<typeof blocklistSchema>;

export async function readBlocklist(): Promise<Blocklist> {
  const raw = await readFile(PATHS.blocklist, "utf-8");
  return blocklistSchema.parse(JSON.parse(raw));
}

// ---------------------------------------------------------------------------
// evergreen.json — trend yokken kullanılacak uzun ömürlü konu havuzu
// ---------------------------------------------------------------------------
export const evergreenTopicSchema = z.object({
  baslik: z.string(),
  kategori: z.string(),
  formatOnerisi: z.enum(["liste", "trivia", "quiz"]),
  kullanildi: z.boolean().default(false),
});
export type EvergreenTopic = z.infer<typeof evergreenTopicSchema>;

export async function readEvergreen(): Promise<EvergreenTopic[]> {
  const raw = await readFile(PATHS.evergreen, "utf-8");
  return z.array(evergreenTopicSchema).parse(JSON.parse(raw));
}

export async function markEvergreenUsed(baslik: string): Promise<void> {
  const topics = await readEvergreen();
  const updated = topics.map((t) =>
    t.baslik === baslik ? { ...t, kullanildi: true } : t
  );
  await writeFile(PATHS.evergreen, JSON.stringify(updated, null, 2) + "\n", "utf-8");
}

// ---------------------------------------------------------------------------
// published-index.json — tekrar önleme + izlenebilirlik (PLAN.md R6, R13)
// ---------------------------------------------------------------------------
export const publishedEntrySchema = z.object({
  slug: z.string(),
  baslik: z.string(),
  konuParmakIzi: z.string(),
  kategori: z.string(),
  format: z.string(),
  yayinTarihi: z.string(),
  otomatikYayinlandi: z.boolean(),
  /** ESKİ: 2026-09-13 öncesi tek seferlik dağıtımın kaydettiği gönderi ID'leri.
   * Artık data/dagitim.json kullanılıyor (lib/dagitimDurumu.ts); dağıtım kuyruğu
   * ilk çalışmasında bunları oraya taşır ki aynı içerik tekrar paylaşılmasın. */
  sosyalPaylasimlar: z
    .object({
      threads: z.string().optional(),
      instagram: z.string().optional(),
      facebook: z.string().optional(),
    })
    .optional(),
});
export type PublishedEntry = z.infer<typeof publishedEntrySchema>;

export async function readPublishedIndex(): Promise<PublishedEntry[]> {
  const raw = await readFile(PATHS.publishedIndex, "utf-8");
  return z.array(publishedEntrySchema).parse(JSON.parse(raw));
}

export async function appendPublishedEntry(entry: PublishedEntry): Promise<void> {
  const entries = await readPublishedIndex();
  entries.push(entry);
  await writeFile(PATHS.publishedIndex, JSON.stringify(entries, null, 2) + "\n", "utf-8");
}


/** Basit konu parmak izi: küçük harf + boşluk normalize — tam tekrar kontrolü için. */
export function konuParmakIzi(baslik: string): string {
  return baslik.toLowerCase().trim().replace(/\s+/g, " ");
}

export async function konuDahaOnceIslendiMi(baslik: string): Promise<boolean> {
  const fingerprint = konuParmakIzi(baslik);
  const entries = await readPublishedIndex();
  return entries.some((e) => e.konuParmakIzi === fingerprint);
}

// ---------------------------------------------------------------------------
// category-weights.json — Analitik Ajanı'nın geri beslemesi
// ---------------------------------------------------------------------------
export async function readCategoryWeights(): Promise<Record<string, number>> {
  const raw = await readFile(PATHS.categoryWeights, "utf-8");
  return z.record(z.string(), z.number()).parse(JSON.parse(raw));
}

export async function writeCategoryWeights(
  weights: Record<string, number>
): Promise<void> {
  await writeFile(
    PATHS.categoryWeights,
    JSON.stringify(weights, null, 2) + "\n",
    "utf-8"
  );
}

// ---------------------------------------------------------------------------
// last-run.json — günlük rapor için çalışma özeti (PLAN.md R12)
// ---------------------------------------------------------------------------
export const runSummarySchema = z.object({
  tarih: z.string(),
  basarili: z.boolean(),
  uretilenIcerikSayisi: z.number().int(),
  otomatikYayinlanan: z.number().int(),
  onayaDusen: z.number().int(),
  reddedilen: z.number().int(),
  hatalar: z.array(z.string()).default([]),
});
export type RunSummary = z.infer<typeof runSummarySchema>;

export async function writeRunSummary(summary: RunSummary): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(PATHS.runLog, JSON.stringify(summary, null, 2) + "\n", "utf-8");
}

export async function readRunSummary(): Promise<RunSummary | null> {
  try {
    const raw = await readFile(PATHS.runLog, "utf-8");
    return runSummarySchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// rejected-topics.json — uygun bulunmayan konuları bir süre tekrar denememek
// için. Aksi halde aynı YouTube şarkısı günde 6 kez sınıflandırılıp LLM
// kotası ve deneme hakkı boşa harcanıyor.
// ---------------------------------------------------------------------------
const rejectedEntrySchema = z.object({
  parmakIzi: z.string(),
  baslik: z.string(),
  sebep: z.string(),
  tarih: z.string(),
});
type RejectedEntry = z.infer<typeof rejectedEntrySchema>;

async function readRejected(): Promise<RejectedEntry[]> {
  try {
    const raw = await readFile(PATHS.rejected, "utf-8");
    return z.array(rejectedEntrySchema).parse(JSON.parse(raw));
  } catch {
    return [];
  }
}

export async function addRejected(baslik: string, sebep: string): Promise<void> {
  const otuzGunOnce = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const liste = (await readRejected()).filter((e) => new Date(e.tarih).getTime() > otuzGunOnce);
  liste.push({
    parmakIzi: konuParmakIzi(baslik),
    baslik,
    sebep: sebep.slice(0, 300),
    tarih: new Date().toISOString(),
  });
  await writeFile(PATHS.rejected, JSON.stringify(liste, null, 2) + "\n", "utf-8");
}

export async function yakindaReddedilenler(gun = 7): Promise<Set<string>> {
  const sinir = Date.now() - gun * 24 * 60 * 60 * 1000;
  return new Set(
    (await readRejected())
      .filter((e) => new Date(e.tarih).getTime() > sinir)
      .map((e) => e.parmakIzi)
  );
}

export function dataPath(...segments: string[]): string {
  return path.join(DATA_DIR, ...segments);
}

// ---------------------------------------------------------------------------
// ozel-gunler.json — Türkiye'deki milli/dini/özel günler takvimi
// (Trend Ajanı'na zamanında içerik önerisi + Dağıtım Ajanı'na kutlama mesajı)
// ---------------------------------------------------------------------------
export const ozelGunSchema = z.object({
  ad: z.string(),
  tur: z.enum(["sabit", "degisken", "dini"]),
  // sabit: her yıl aynı ay/gün.
  ay: z.number().min(1).max(12).optional(),
  gun: z.number().min(1).max(31).optional(),
  // degisken: ayın n'inci belirli haftanın günü (ör. Anneler Günü = Mayıs'ın 2. Pazarı).
  haftaninGunu: z.number().min(0).max(6).optional(),
  kacinciHafta: z.number().min(1).max(5).optional(),
  // dini: hicri takvime göre kaydığı için elle girilen, teyitli tarih listesi.
  tarihler: z.array(z.string()).optional(),
  kategori: z.string(),
  formatOnerisi: z.enum(["liste", "trivia", "quiz"]),
  konuBaslik: z.string(),
  /** İçerik, günden kaç gün önce aday havuzuna girmeye başlasın. */
  oncedenGun: z.number().min(0).max(30).default(5),
});
export type OzelGun = z.infer<typeof ozelGunSchema>;

export async function readOzelGunler(): Promise<OzelGun[]> {
  const raw = await readFile(PATHS.ozelGunler, "utf-8");
  return z.array(ozelGunSchema).parse(JSON.parse(raw));
}

function haftaninGunuTarihi(yil: number, ay: number, haftaninGunu: number, kacinciHafta: number): Date {
  const ilkGun = new Date(Date.UTC(yil, ay - 1, 1));
  const ilkGunHaftaninGunu = ilkGun.getUTCDay();
  const ilkEslesme = 1 + ((haftaninGunu - ilkGunHaftaninGunu + 7) % 7);
  return new Date(Date.UTC(yil, ay - 1, ilkEslesme + (kacinciHafta - 1) * 7));
}

/**
 * Bir özel günün, verilen referans tarihinden sonraki (bugün dahil) en
 * yakın gerçekleşme tarihini döner. "dini" türde tarih listesinde gelecek
 * tarih yoksa null döner (takvimin güncellenmesi gerektiği anlamına gelir).
 */
export function ozelGununHedefTarihi(gun: OzelGun, referans: Date): Date | null {
  if (gun.tur === "dini") {
    const gelecekler = (gun.tarihler ?? [])
      .map((t) => new Date(`${t}T00:00:00Z`))
      .filter((t) => t.getTime() >= referans.getTime() - 24 * 60 * 60 * 1000)
      .sort((a, b) => a.getTime() - b.getTime());
    return gelecekler[0] ?? null;
  }

  const buYil = referans.getUTCFullYear();
  const hesapla = (yil: number): Date =>
    gun.tur === "sabit"
      ? new Date(Date.UTC(yil, (gun.ay ?? 1) - 1, gun.gun ?? 1))
      : haftaninGunuTarihi(yil, gun.ay ?? 1, gun.haftaninGunu ?? 0, gun.kacinciHafta ?? 1);

  const buYilki = hesapla(buYil);
  const dunGeceYarisi = new Date(referans);
  dunGeceYarisi.setUTCHours(0, 0, 0, 0);
  return buYilki.getTime() >= dunGeceYarisi.getTime() ? buYilki : hesapla(buYil + 1);
}

// ---------------------------------------------------------------------------
// kutlama-index.json — anahtar (ör. "icerik:23 Nisan..." / "kutlama:...") başına
// "en son hangi yıl işlendi" bilgisini tutan genel bir yıllık işaretleyici.
// Özel günler her yıl tekrar işlenmesi gereken TEK kalıcı-tekrar istisnası
// olduğu için, normal "daha önce işlendi mi" (kalıcı) kontrolünün yerine
// bunlar için yıl bazlı bu mekanizma kullanılır (bkz. processCandidate.ts).
// ---------------------------------------------------------------------------
async function readYillikIsaretler(): Promise<Record<string, number>> {
  try {
    const raw = await readFile(PATHS.kutlamaIndex, "utf-8");
    return z.record(z.string(), z.number()).parse(JSON.parse(raw));
  } catch {
    return {};
  }
}

async function yillikIsaretliMi(anahtar: string, yil: number): Promise<boolean> {
  const index = await readYillikIsaretler();
  return index[anahtar] === yil;
}

async function yillikIsaretle(anahtar: string, yil: number): Promise<void> {
  const index = await readYillikIsaretler();
  index[anahtar] = yil;
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(PATHS.kutlamaIndex, JSON.stringify(index, null, 2) + "\n", "utf-8");
}

export const kutlamaGonderildiMi = (ad: string, yil: number) => yillikIsaretliMi(`kutlama:${ad}`, yil);
export const markKutlamaGonderildi = (ad: string, yil: number) => yillikIsaretle(`kutlama:${ad}`, yil);

/** Bu özel gün için bu yıl zaten içerik üretimi denendi/başarılı oldu mu? */
export const ozelGunIcerikUretildiMi = (ad: string, yil: number) => yillikIsaretliMi(`icerik:${ad}`, yil);
export const markOzelGunIcerikUretildi = (ad: string, yil: number) => yillikIsaretle(`icerik:${ad}`, yil);
