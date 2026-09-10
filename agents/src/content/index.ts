import { z } from "zod";
import { chatComplete, type ProviderName } from "../lib/llmRouter.js";
import { slugify } from "../lib/slug.js";
import { gatherSourceFor, type GatheredSource } from "./sourceGathering.js";
import {
  SINIFLANDIRMA_SISTEM_PROMPTU,
  siniflandirmaKullaniciPromptu,
  ICERIK_URETIM_SISTEM_PROMPTU,
  icerikUretimKullaniciPromptu,
} from "./prompts.js";
import {
  kategoriSchema,
  formatSchema,
  type PostDraft,
  type Post,
} from "../lib/schemas.js";

const siniflandirmaSchema = z.object({
  degerliMi: z.boolean(),
  hassasiyetVar: z.boolean(),
  kategori: kategoriSchema,
  formatOnerisi: formatSchema,
  gerekce: z.string(),
});
export type Siniflandirma = z.infer<typeof siniflandirmaSchema>;

/** JSON çıktısını ayrıştırır; model bazen kod bloğu (```json) ile sarabiliyor. */
function parseJsonLoose<T>(text: string, schema: z.ZodType<T>): T {
  const temizlenmis = text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
  return schema.parse(JSON.parse(temizlenmis));
}

export interface TopicClassificationResult {
  uygun: boolean;
  siniflandirma?: Siniflandirma;
  sebep?: string;
  provider?: ProviderName;
}

/** Trend Ajanı'nın bulduğu bir konunun içerik üretimine uygun olup olmadığına karar verir. */
export async function classifyTopic(baslik: string): Promise<TopicClassificationResult> {
  try {
    const { text, provider } = await chatComplete({
      systemPrompt: SINIFLANDIRMA_SISTEM_PROMPTU,
      userPrompt: siniflandirmaKullaniciPromptu(baslik),
      jsonMode: true,
      temperature: 0.2,
    });
    const siniflandirma = parseJsonLoose(text, siniflandirmaSchema);

    if (siniflandirma.hassasiyetVar) {
      return { uygun: false, siniflandirma, sebep: "hassas konu", provider };
    }
    if (!siniflandirma.degerliMi) {
      return { uygun: false, siniflandirma, sebep: "değer katmıyor", provider };
    }
    return { uygun: true, siniflandirma, provider };
  } catch (err) {
    return {
      uygun: false,
      sebep: `sınıflandırma hatası: ${err instanceof Error ? err.message : err}`,
    };
  }
}

const listeMaddesiUretimSchema = z.object({
  baslik: z.string(),
  metin: z.string(),
});

const quizSorusuUretimSchema = z.object({
  soru: z.string(),
  secenekler: z.array(z.string()).min(2).max(6),
  dogruIndex: z.number().int().min(0),
  aciklama: z.string().optional(),
});

const icerikUretimSchema = z.object({
  baslik: z.string(),
  seoBaslik: z.string(),
  metaAciklama: z.string(),
  girisParagrafi: z.string(),
  etiketler: z.array(z.string()).default([]),
  listeMaddeleri: z.array(listeMaddesiUretimSchema).optional(),
  quizSorulari: z.array(quizSorusuUretimSchema).optional(),
});

export interface ContentGenerationResult {
  basarili: boolean;
  draft?: PostDraft;
  kaynak?: GatheredSource;
  uretenProvider?: ProviderName;
  sebep?: string;
}

/**
 * Bir konu için tam içerik taslağı üretir: önce Wikipedia'dan kaynak metni
 * toplar (bulunamazsa üretim yapılmaz — kaynaksız içerik yok, PLAN.md R2),
 * sonra LLM'e SADECE bu kaynağa dayanarak yazdırır.
 */
export async function generateContentDraft(params: {
  konuBasligi: string;
  kategori: Siniflandirma["kategori"];
  format: Siniflandirma["formatOnerisi"];
}): Promise<ContentGenerationResult> {
  const kaynak = await gatherSourceFor(params.konuBasligi);
  if (!kaynak) {
    return { basarili: false, sebep: "Wikipedia'da yeterli kaynak metni bulunamadı" };
  }

  let sonMetin = "";
  try {
    const { text, provider } = await chatComplete({
      systemPrompt: ICERIK_URETIM_SISTEM_PROMPTU,
      userPrompt: icerikUretimKullaniciPromptu({
        konuBasligi: params.konuBasligi,
        kaynakMetni: kaynak.ozetMetni,
        kaynakUrl: kaynak.url,
        format: params.format,
        kategori: params.kategori,
      }),
      jsonMode: true,
      temperature: 0.8,
    });
    sonMetin = text;
    const uretim = parseJsonLoose(text, icerikUretimSchema);

    if (params.format === "quiz" && (!uretim.quizSorulari || uretim.quizSorulari.length < 2)) {
      return { basarili: false, kaynak, sebep: "quiz için yetersiz soru üretildi" };
    }
    if (params.format !== "quiz" && (!uretim.listeMaddeleri || uretim.listeMaddeleri.length < 2)) {
      return { basarili: false, kaynak, sebep: "liste/trivia için yetersiz madde üretildi" };
    }

    const slug = slugify(uretim.baslik);
    const frontmatter: Post = {
      baslik: uretim.baslik,
      seoBaslik: uretim.seoBaslik.slice(0, 70),
      metaAciklama: uretim.metaAciklama.slice(0, 160),
      format: params.format,
      kategori: params.kategori,
      etiketler: uretim.etiketler ?? [],
      yayinTarihi: new Date(),
      kapakGorseli: "", // Görsel Ajanı doldurur
      kapakGorselAlt: uretim.baslik,
      listeMaddeleri: uretim.listeMaddeleri,
      quizSorulari: uretim.quizSorulari,
      kaynaklar: [
        {
          baslik: `Wikipedia — ${kaynak.baslik}`,
          url: kaynak.url,
          atif: "CC BY-SA 4.0",
        },
      ],
      taslak: true, // Moderasyon geçene kadar taslak kalır
    };

    const draft: PostDraft = {
      frontmatter,
      govdeMarkdown: uretim.girisParagrafi,
      slug,
    };

    return { basarili: true, draft, kaynak, uretenProvider: provider };
  } catch (err) {
    return {
      basarili: false,
      kaynak,
      sebep: `içerik üretim hatası: ${err instanceof Error ? err.message : err} (ham yanıt: ${sonMetin.slice(0, 200)})`,
    };
  }
}
