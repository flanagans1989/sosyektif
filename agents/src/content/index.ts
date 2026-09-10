import { z } from "zod";
import { chatComplete, type ProviderName } from "../lib/llmRouter.js";
import { parseJsonLoose } from "../lib/json.js";
import { slugify } from "../lib/slug.js";
import type { GatheredSource } from "./sourceGathering.js";
import {
  SINIFLANDIRMA_SISTEM_PROMPTU,
  siniflandirmaKullaniciPromptu,
  ICERIK_URETIM_SISTEM_PROMPTU,
  icerikUretimKullaniciPromptu,
} from "./prompts.js";
import {
  kategoriSchema,
  formatSchema,
  type Format,
  type Kategori,
  type PostDraft,
  type Post,
  type QuizSoru,
} from "../lib/schemas.js";

// ---------------------------------------------------------------------------
// Sınıflandırma
// ---------------------------------------------------------------------------
const siniflandirmaSchema = z.object({
  uygun: z.boolean(),
  redSebebi: z.string().nullable().optional(),
  konuOdagi: z.string().default(""),
  aci: z.string().default(""),
  kategori: kategoriSchema.catch("yasam"),
  formatOnerisi: formatSchema.catch("liste"),
  kisiMi: z.boolean().catch(true),
});

export interface Siniflandirma {
  konuOdagi: string;
  aci: string;
  kategori: Kategori;
  formatOnerisi: Format;
  /** Kişi konularında stok fotoğraf aranmaz (kişilik hakkı / Pexels lisansı, PLAN.md R10). */
  kisiMi: boolean;
}

export interface TopicClassificationResult {
  uygun: boolean;
  sebep?: string;
  /** LLM'e ulaşılamadıysa dolu olur — geçici hata, konu kalıcı olarak reddedilmemeli. */
  hata?: string;
  siniflandirma?: Siniflandirma;
  provider?: ProviderName;
}

/**
 * Gündem başlığının içerik üretimine uygun olup olmadığına karar verir ve
 * uygunsa Vikipedi'de aranabilecek zamansız bir konu odağı çıkarır.
 */
export async function classifyTopic(
  baslik: string,
  kaynakTuru: string
): Promise<TopicClassificationResult> {
  try {
    const { text, provider } = await chatComplete({
      systemPrompt: SINIFLANDIRMA_SISTEM_PROMPTU,
      userPrompt: siniflandirmaKullaniciPromptu(baslik, kaynakTuru),
      jsonMode: true,
      temperature: 0.2,
    });
    const s = parseJsonLoose(text, siniflandirmaSchema);
    if (!s.uygun) {
      return { uygun: false, sebep: s.redSebebi ?? "uygun bulunmadı", provider };
    }
    return {
      uygun: true,
      provider,
      siniflandirma: {
        konuOdagi: s.konuOdagi.trim() || baslik,
        aci: s.aci.trim(),
        kategori: s.kategori,
        formatOnerisi: s.formatOnerisi,
        kisiMi: s.kisiMi,
      },
    };
  } catch (err) {
    return { uygun: false, hata: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// İçerik üretimi
// ---------------------------------------------------------------------------
const icerikUretimSchema = z.object({
  baslik: z.string().min(5),
  seoBaslik: z.string().default(""),
  metaAciklama: z.string().default(""),
  girisParagrafi: z.string().default(""),
  etiketler: z.array(z.string()).catch([]),
  listeMaddeleri: z.array(z.object({ baslik: z.string(), metin: z.string() })).optional(),
  quizSorulari: z
    .array(
      z.object({
        soru: z.string(),
        secenekler: z.array(z.string()),
        dogruIndex: z.coerce.number().int(),
        aciklama: z.string().optional(),
      })
    )
    .optional(),
});

export interface ContentGenerationResult {
  basarili: boolean;
  draft?: PostDraft;
  uretenProvider?: ProviderName;
  sebep?: string;
}

function kirp(metin: string, max: number): string {
  const temiz = metin.trim();
  if (temiz.length <= max) return temiz;
  const kesit = temiz.slice(0, max - 1);
  const bosluk = kesit.lastIndexOf(" ");
  return `${bosluk > max * 0.6 ? kesit.slice(0, bosluk) : kesit}…`;
}

/** Şemanın kabul ettiği şekle getirir: 2-6 şık, geçerli doğru cevap indeksi. */
function quizNormalize(sorular: z.infer<typeof icerikUretimSchema>["quizSorulari"]): QuizSoru[] {
  return (sorular ?? [])
    .map((s) => ({ ...s, secenekler: s.secenekler.slice(0, 6) }))
    .filter((s) => s.secenekler.length >= 2 && s.dogruIndex >= 0 && s.dogruIndex < s.secenekler.length);
}

/**
 * Önceden toplanmış kaynağa dayanarak içerik taslağı üretir. Madde sayısı
 * gibi yapısal eksiklerde taslağı reddetmez — onları Moderasyon Ajanı puanlar
 * ve gerekirse revizyon notuyla yeniden yazdırır. Yalnızca hiç kullanılabilir
 * içerik çıkmazsa başarısız döner.
 */
export async function generateContentDraft(params: {
  konu: string;
  aci: string;
  kategori: Kategori;
  format: Format;
  kaynak: GatheredSource;
  revizyonNotlari?: string;
}): Promise<ContentGenerationResult> {
  const { konu, aci, kategori, kaynak, revizyonNotlari } = params;

  // Kısa kaynakla 7-10 maddelik liste zorlamak dolgu ve uydurmaya iter.
  const format: Format =
    params.format === "liste" && kaynak.metin.length < 1500 ? "trivia" : params.format;

  let sonHata = "";
  for (const sicaklik of [0.8, 0.5]) {
    try {
      const { text, provider } = await chatComplete({
        systemPrompt: ICERIK_URETIM_SISTEM_PROMPTU,
        userPrompt: icerikUretimKullaniciPromptu({
          konu,
          aci,
          kategori,
          format,
          kaynakMetni: kaynak.metin,
          revizyonNotlari,
        }),
        jsonMode: true,
        temperature: sicaklik,
      });
      const u = parseJsonLoose(text, icerikUretimSchema);

      const listeMaddeleri = format === "quiz" ? undefined : u.listeMaddeleri?.filter((m) => m.baslik && m.metin);
      const quizSorulari = format === "quiz" ? quizNormalize(u.quizSorulari) : undefined;
      const maddeSayisi = format === "quiz" ? quizSorulari?.length ?? 0 : listeMaddeleri?.length ?? 0;
      if (maddeSayisi === 0) {
        sonHata = "kullanılabilir madde/soru üretilmedi";
        continue;
      }

      const baslik = u.baslik.trim();
      const frontmatter: Post = {
        baslik,
        seoBaslik: kirp(u.seoBaslik || baslik, 70),
        metaAciklama: kirp(u.metaAciklama || u.girisParagrafi || baslik, 160),
        format,
        kategori,
        etiketler: u.etiketler.slice(0, 5),
        yayinTarihi: new Date(),
        kapakGorseli: "", // Görsel Ajanı doldurur
        kapakGorselAlt: baslik,
        listeMaddeleri,
        quizSorulari,
        kaynaklar: kaynak.kaynaklar,
        taslak: true, // yayın kararı pipeline'da verilir
      };

      return {
        basarili: true,
        uretenProvider: provider,
        draft: { frontmatter, govdeMarkdown: u.girisParagrafi, slug: slugify(baslik) },
      };
    } catch (err) {
      sonHata = err instanceof Error ? err.message : String(err);
    }
  }

  return { basarili: false, sebep: `içerik üretilemedi: ${sonHata.slice(0, 300)}` };
}
