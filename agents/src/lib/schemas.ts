/**
 * Bu şemalar site/src/content.config.ts ile BİREBİR uyumlu tutulmalıdır.
 * Biri değişirse diğeri de güncellenmeli — aksi halde Astro build'i kırılır.
 */
import { z } from "zod";

export const KATEGORILER = [
  "eglence",
  "pop-kultur",
  "bilim",
  "teknoloji",
  "spor",
  "yasam",
  "tarih",
] as const;

export const kategoriSchema = z.enum(KATEGORILER);
export type Kategori = z.infer<typeof kategoriSchema>;

export const formatSchema = z.enum(["liste", "trivia", "quiz"]);
export type Format = z.infer<typeof formatSchema>;

export const kaynakSchema = z.object({
  baslik: z.string(),
  url: z.string().url(),
  atif: z.string().optional(),
});
export type Kaynak = z.infer<typeof kaynakSchema>;

export const listeMaddesiSchema = z.object({
  baslik: z.string(),
  metin: z.string(),
  gorselAlt: z.string().optional(),
});
export type ListeMaddesi = z.infer<typeof listeMaddesiSchema>;

export const quizSoruSchema = z.object({
  soru: z.string(),
  secenekler: z.array(z.string()).min(2).max(6),
  dogruIndex: z.number().int().min(0),
  aciklama: z.string().optional(),
});
export type QuizSoru = z.infer<typeof quizSoruSchema>;

export const postSchema = z.object({
  baslik: z.string().min(5),
  seoBaslik: z.string().max(70),
  metaAciklama: z.string().max(160),
  format: formatSchema,
  kategori: kategoriSchema,
  etiketler: z.array(z.string()).default([]),
  yayinTarihi: z.coerce.date(),
  guncellemeTarihi: z.coerce.date().optional(),

  kapakGorseli: z.string(),
  kapakGorselAlt: z.string(),
  gorselKredisi: z.string().optional(),

  listeMaddeleri: z.array(listeMaddesiSchema).optional(),
  quizSorulari: z.array(quizSoruSchema).optional(),

  kaynaklar: z.array(kaynakSchema).default([]),

  moderasyon: z
    .object({
      skor: z.number().min(0).max(1),
      otomatikYayinlandi: z.boolean(),
      hakemModel: z.string().optional(),
    })
    .optional(),

  taslak: z.boolean().default(false),
});
export type Post = z.infer<typeof postSchema>;

/** İçerik gövdesi (Markdown body) frontmatter dışında ayrı taşınır. */
export interface PostDraft {
  frontmatter: Post;
  govdeMarkdown: string;
  /** Yayın Ajanı'nın dosya adı için kullanacağı slug (uzantısız). */
  slug: string;
}

/** Trend Ajanı'nın ürettiği ham konu adayı. */
export const trendCandidateSchema = z.object({
  baslik: z.string(),
  kaynak: z.enum([
    "google-trends",
    "wikipedia",
    "google-news",
    "youtube",
    "reddit",
    "evergreen",
  ]),
  url: z.string().url().optional(),
  tahminiIlgi: z.number().min(0).max(1).default(0.5),
  kategoriTahmini: kategoriSchema.optional(),
  formatOnerisi: formatSchema.optional(),
  hassasiyetNotu: z.string().optional(),
});
export type TrendCandidate = z.infer<typeof trendCandidateSchema>;

/** Moderasyon Ajanı'nın kararı. */
export const moderationResultSchema = z.object({
  /** Skor onay eşiğini geçti mi (en az onay kuyruğuna girebilir mi). */
  gecti: z.boolean(),
  /** Düzeltilemez red (kara liste, tekrar, hassas) — revizyon denenmez. */
  sertRed: z.boolean(),
  skor: z.number().min(0).max(1),
  otomatikYayinaUygun: z.boolean(),
  redSebebi: z.string().optional(),
  /** Yazara geri gönderilecek düzeltme talimatları (revizyon turu için). */
  duzeltmeNotlari: z.string().optional(),
  detaylar: z.object({
    karaListeIhlali: z.boolean(),
    benzerlikSkoru: z.number().min(0).max(1),
    hakemCalisti: z.boolean(),
    dogrulukPuani: z.number().nullable(),
    degerPuani: z.number().nullable(),
    celiskiVarMi: z.boolean().nullable(),
    baslikYaniltici: z.boolean().nullable(),
    dayanaksizIddialar: z.array(z.string()),
    hakemProvider: z.string().optional(),
    tekrarMi: z.boolean(),
  }),
});
export type ModerationResult = z.infer<typeof moderationResultSchema>;
