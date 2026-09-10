import { z } from "zod";
import { checkBlocklist } from "../lib/blocklist.js";
import { ngramOverlapScore } from "../lib/similarity.js";
import { konuDahaOnceIslendiMi } from "../lib/state.js";
import { chatCompleteExcluding, type ProviderName } from "../lib/llmRouter.js";
import { HAKEM_SISTEM_PROMPTU, hakemKullaniciPromptu } from "../content/prompts.js";
import type { PostDraft, ModerationResult } from "../lib/schemas.js";
import type { Config } from "../lib/state.js";

const hakemYanitSchema = z.object({
  kaynaklaTutarliMi: z.boolean(),
  yaniltciBaslikMi: z.boolean(),
  degerKatiyorMu: z.boolean(),
  notlar: z.string(),
});

function draftToPlainText(draft: PostDraft): string {
  const parcalar = [draft.frontmatter.baslik, draft.govdeMarkdown];
  for (const madde of draft.frontmatter.listeMaddeleri ?? []) {
    parcalar.push(madde.baslik, madde.metin);
  }
  for (const soru of draft.frontmatter.quizSorulari ?? []) {
    parcalar.push(soru.soru, ...soru.secenekler, soru.aciklama ?? "");
  }
  return parcalar.join("\n");
}

function parseJsonLoose<T>(text: string, schema: z.ZodType<T>): T {
  const temizlenmis = text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
  return schema.parse(JSON.parse(temizlenmis));
}

/** Basit yapısal kalite kontrolleri (uzunluk, madde sayısı, quiz tutarlılığı). */
function qualityHeuristics(draft: PostDraft): { skor: number; notlar: string[] } {
  const notlar: string[] = [];
  let skor = 1;

  if (draft.frontmatter.baslik.length < 10) {
    skor -= 0.3;
    notlar.push("başlık çok kısa");
  }

  if (draft.frontmatter.format === "quiz") {
    const sorular = draft.frontmatter.quizSorulari ?? [];
    if (sorular.length < 3) {
      skor -= 0.3;
      notlar.push("3'ten az quiz sorusu");
    }
    for (const soru of sorular) {
      if (soru.dogruIndex >= soru.secenekler.length) {
        skor -= 0.5;
        notlar.push("quiz doğru cevap indexi geçersiz");
      }
    }
  } else {
    const maddeler = draft.frontmatter.listeMaddeleri ?? [];
    const minMadde = draft.frontmatter.format === "liste" ? 5 : 3;
    if (maddeler.length < minMadde) {
      skor -= 0.3;
      notlar.push(`${minMadde}'ten az madde`);
    }
    if (maddeler.some((m) => m.metin.length < 20)) {
      skor -= 0.2;
      notlar.push("bazı madde metinleri çok kısa");
    }
  }

  return { skor: Math.max(0, skor), notlar };
}

export interface ModerateParams {
  draft: PostDraft;
  kaynakMetni: string;
  uretenProvider: ProviderName;
  config: Config;
}

export async function moderateDraft(params: ModerateParams): Promise<ModerationResult> {
  const { draft, kaynakMetni, uretenProvider, config } = params;
  const tamMetin = draftToPlainText(draft);

  // 1. Kara liste
  const blocklistSonucu = await checkBlocklist(tamMetin);
  if (blocklistSonucu.ihlalVar) {
    return {
      gecti: false,
      skor: 0,
      otomatikYayinaUygun: false,
      redSebebi: `Kara liste ihlali: ${blocklistSonucu.eslesenTerimler.join(", ")}`,
      detaylar: {
        karaListeIhlali: true,
        benzerlikSkoru: 0,
        hakemOnayi: null,
        tekrarMi: false,
      },
    };
  }

  // 2. Tekrar kontrolü
  const tekrarMi = await konuDahaOnceIslendiMi(draft.frontmatter.baslik);
  if (tekrarMi) {
    return {
      gecti: false,
      skor: 0,
      otomatikYayinaUygun: false,
      redSebebi: "Bu konu daha önce işlenmiş",
      detaylar: {
        karaListeIhlali: false,
        benzerlikSkoru: 0,
        hakemOnayi: null,
        tekrarMi: true,
      },
    };
  }

  // 3. Benzerlik (kaynaktan birebir kopyalama kontrolü)
  const benzerlikSkoru = ngramOverlapScore(tamMetin, kaynakMetni);
  const benzerlikEsigiAsildi = benzerlikSkoru > 0.5;

  // 4. Hakem modeli — üretenden FARKLI sağlayıcı zorunlu
  let hakemOnayi: boolean | null = null;
  let hakemNotu: string | undefined;
  try {
    const { text } = await chatCompleteExcluding(uretenProvider, {
      systemPrompt: HAKEM_SISTEM_PROMPTU,
      userPrompt: hakemKullaniciPromptu({ uretilenIcerik: tamMetin, kaynakMetni }),
      jsonMode: true,
      temperature: 0.2,
    });
    const hakemYaniti = parseJsonLoose(text, hakemYanitSchema);
    hakemOnayi =
      hakemYaniti.kaynaklaTutarliMi &&
      !hakemYaniti.yaniltciBaslikMi &&
      hakemYaniti.degerKatiyorMu;
    hakemNotu = hakemYaniti.notlar;
  } catch (err) {
    hakemNotu = `hakem modeli çalıştırılamadı: ${err instanceof Error ? err.message : err}`;
  }

  // 5. Yapısal kalite
  const kalite = qualityHeuristics(draft);

  // Genel skor: kalite ağırlıklı, benzerlik cezası, hakem onayı olmazsa büyük ceza
  let skor = kalite.skor;
  if (benzerlikEsigiAsildi) skor -= 0.4;
  if (hakemOnayi === false) skor -= 0.5;
  if (hakemOnayi === null) skor -= 0.15; // hakem çalışmadıysa temkinli ol
  skor = Math.max(0, Math.min(1, skor));

  const gecti = skor > 0 && !benzerlikEsigiAsildi && hakemOnayi !== false;
  const otomatikYayinaUygun = gecti && skor >= config.otomatikYayinEsigi;

  const redSebepleri = [
    ...(benzerlikEsigiAsildi ? ["kaynakla aşırı benzerlik"] : []),
    ...(hakemOnayi === false ? ["hakem modeli onaylamadı"] : []),
    ...kalite.notlar,
  ];

  return {
    gecti,
    skor,
    otomatikYayinaUygun,
    redSebebi: gecti ? undefined : redSebepleri.join("; "),
    detaylar: {
      karaListeIhlali: false,
      benzerlikSkoru,
      hakemOnayi,
      hakemNotu,
      tekrarMi: false,
    },
  };
}
