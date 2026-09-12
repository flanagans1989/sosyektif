import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Ajanların ürettiği içerik dört formattan birine ayrılır: liste, trivia, quiz, kisilik.
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

const kisilikSonuc = z.object({
  id: z.string(),
  baslik: z.string(),
  aciklama: z.string(),
});

const kisilikSoru = z.object({
  soru: z.string(),
  secenekler: z.array(z.object({ metin: z.string(), sonucId: z.string() })).min(2).max(6),
});

const postSchema = z.object({
  baslik: z.string(),
  seoBaslik: z.string().max(70),
  metaAciklama: z.string().max(160),
  format: z.enum(['liste', 'trivia', 'quiz', 'kisilik']),
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
  kisilikSonuclari: z.array(kisilikSonuc).optional(),
  kisilikSorulari: z.array(kisilikSoru).optional(),

  kaynaklar: z.array(kaynak).default([]),

  // Moderasyon Ajanı'nın ürettiği izlenebilirlik bilgisi
  moderasyon: z
    .object({
      skor: z.number().min(0).max(1),
      otomatikYayinlandi: z.boolean(),
      hakemModel: z.string().optional(),
    })
    .optional(),

  // Yayın sonrası elle girilir (ajanlar bu alanı hiç üretmez) — yayınlanmış
  // bir içerikte hata düzeltildiğinde şeffaflık notu (bkz. /duzeltmeler).
  duzeltmeNotu: z.string().optional(),

  taslak: z.boolean().default(false),
});

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: postSchema,
});

export const collections = { posts };
