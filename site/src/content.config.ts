import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Ajanların ürettiği içerik üç formattan birine ayrılır: liste, trivia, quiz.
// Şema, agents/ tarafındaki zod şemasıyla birebir uyumlu tutulmalıdır.

const kategori = z.enum([
  'eglence',
  'pop-kultur',
  'bilim',
  'teknoloji',
  'spor',
  'yasam',
  'tarih',
]);

const kaynak = z.object({
  baslik: z.string(),
  url: z.string().url(),
  // Wikipedia gibi CC BY-SA kaynaklarda atıf zorunlu
  atif: z.string().optional(),
});

const listeMaddesi = z.object({
  baslik: z.string(),
  metin: z.string(),
  gorselAlt: z.string().optional(),
});

const quizSoru = z.object({
  soru: z.string(),
  secenekler: z.array(z.string()).min(2).max(6),
  dogruIndex: z.number().int().min(0),
  aciklama: z.string().optional(),
});

const postSchema = z.object({
  baslik: z.string(),
  seoBaslik: z.string().max(70),
  metaAciklama: z.string().max(160),
  format: z.enum(['liste', 'trivia', 'quiz']),
  kategori,
  etiketler: z.array(z.string()).default([]),
  yayinTarihi: z.coerce.date(),
  guncellemeTarihi: z.coerce.date().optional(),

  kapakGorseli: z.string(),
  kapakGorselAlt: z.string(),
  // Pexels/Unsplash kullanıldıysa atıf zorunlu; yerel tipografik kapakta gerekmez
  gorselKredisi: z.string().optional(),

  // Format'a göre biri dolu olur
  listeMaddeleri: z.array(listeMaddesi).optional(),
  quizSorulari: z.array(quizSoru).optional(),

  kaynaklar: z.array(kaynak).default([]),

  // Moderasyon Ajanı'nın ürettiği izlenebilirlik bilgisi
  moderasyon: z
    .object({
      skor: z.number().min(0).max(1),
      otomatikYayinlandi: z.boolean(),
      hakemModel: z.string().optional(),
    })
    .optional(),

  taslak: z.boolean().default(false),
});

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: postSchema,
});

export const collections = { posts };
