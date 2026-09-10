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
  gunlukHedefIcerikSayisi: z.number().int().min(0).default(2),
  otomatikYayinEsigi: z.number().min(0).max(1).default(0.85),
  onayaDusEsigi: z.number().min(0).max(1).default(0.6),
  ardisikBasarisizCalismaLimiti: z.number().int().min(1).default(3),
  ardisikBasarisizCalisma: z.number().int().min(0).default(0),
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

export function dataPath(...segments: string[]): string {
  return path.join(DATA_DIR, ...segments);
}
