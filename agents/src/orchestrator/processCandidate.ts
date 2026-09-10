import { classifyTopic, generateContentDraft } from "../content/index.js";
import { gatherSourceFor } from "../content/sourceGathering.js";
import { moderateDraft } from "../moderation/index.js";
import { generateCoverImage } from "../image/index.js";
import { publishDraft, type PublishResult } from "../publish/index.js";
import { distributeContent } from "../distribute/index.js";
import { notifyAdmin, escapeHtml } from "../lib/telegram.js";
import { konuDahaOnceIslendiMi, markEvergreenUsed, type Config } from "../lib/state.js";
import { FORMAT_ETIKETLERI_TR } from "../lib/formatLabels.js";
import type { ModerationResult, PostDraft, TrendCandidate } from "../lib/schemas.js";

export interface AdaySonucu {
  durum: "otomatik" | "onay" | "red";
  sebep?: string;
  skor?: number;
  baslik?: string;
  /** true ise konu bir süre tekrar denenmez (uygunsuz/kaynaksız/düşük kalite). */
  kaliciRed: boolean;
}

const REPO = process.env.GITHUB_REPOSITORY ?? "flanagans1989/sosyektif";

function onayMesaji(draft: PostDraft, moderasyon: ModerationResult, yayin: PublishResult, provaModu: boolean): string {
  const fm = draft.frontmatter;
  const maddeBasliklari =
    fm.format === "quiz" ? (fm.quizSorulari ?? []).map((s) => s.soru) : (fm.listeMaddeleri ?? []).map((m) => m.baslik);
  const d = moderasyon.detaylar;
  const puanlar = d.hakemCalisti ? `doğruluk ${d.dogrulukPuani}/5 · değer ${d.degerPuani}/5` : "hakem çalışmadı";

  const satirlar = [
    `⏳ <b>Onay bekliyor</b> — skor ${moderasyon.skor} (${puanlar})${provaModu ? " · prova modu" : ""}`,
    "",
    `<b>${escapeHtml(fm.baslik)}</b>`,
    `${fm.kategori} · ${FORMAT_ETIKETLERI_TR[fm.format]} · ${maddeBasliklari.length} ${fm.format === "quiz" ? "soru" : "madde"}`,
    "",
    ...maddeBasliklari.slice(0, 6).map((b) => `• ${escapeHtml(b)}`),
  ];
  if (maddeBasliklari.length > 6) satirlar.push(`• … (+${maddeBasliklari.length - 6})`);
  if (moderasyon.duzeltmeNotlari) {
    satirlar.push("", `<i>Denetçi notları:</i>\n${escapeHtml(moderasyon.duzeltmeNotlari.slice(0, 600))}`);
  }
  satirlar.push(
    "",
    `✏️ Onaylamak için dosyada <code>taslak: true</code> → <code>taslak: false</code> yap:`,
    `https://github.com/${REPO}/edit/main/site/src/content/posts/${yayin.slug}.md`
  );
  return satirlar.join("\n");
}

/**
 * Tek bir aday için tam zincir:
 * sınıflandırma → kaynak → taslak → moderasyon (→ gerekirse 1 revizyon) → görsel → yayın/onay.
 */
export async function processCandidate(aday: TrendCandidate, config: Config): Promise<AdaySonucu> {
  // 1. Sınıflandırma + konu odağı
  const sinif = await classifyTopic(aday.baslik, aday.kaynak);
  if (sinif.hata) {
    return { durum: "red", sebep: `sınıflandırma hatası: ${sinif.hata.slice(0, 200)}`, kaliciRed: false };
  }
  if (!sinif.uygun || !sinif.siniflandirma) {
    return { durum: "red", sebep: `uygun değil: ${sinif.sebep}`, kaliciRed: true };
  }
  const { konuOdagi, aci } = sinif.siniflandirma;
  const kategori = aday.kategoriTahmini ?? sinif.siniflandirma.kategori;
  const format = aday.formatOnerisi ?? sinif.siniflandirma.formatOnerisi;

  if (await konuDahaOnceIslendiMi(konuOdagi)) {
    return { durum: "red", sebep: `"${konuOdagi}" daha önce işlendi`, kaliciRed: true };
  }

  // 2. Kaynak (LLM çağrısından önce — kaynaksızsa boşuna üretim yapılmaz)
  const kaynak = await gatherSourceFor(konuOdagi);
  if (!kaynak) {
    return { durum: "red", sebep: `"${konuOdagi}" için yeterli Vikipedi kaynağı yok`, kaliciRed: true };
  }

  // 3. Taslak + moderasyon; sert red yoksa ve otomatik yayın seviyesine
  //    ulaşılmadıysa, denetçi notlarıyla bir kez yeniden yazdırılır.
  let enIyi: { draft: PostDraft; moderasyon: ModerationResult } | null = null;
  let notlar: string | undefined;
  let uretimHatasi: string | undefined;
  for (let tur = 0; tur < 2; tur++) {
    const uretim = await generateContentDraft({ konu: konuOdagi, aci, kategori, format, kaynak, revizyonNotlari: notlar });
    if (!uretim.basarili || !uretim.draft || !uretim.uretenProvider) {
      uretimHatasi = uretim.sebep;
      break;
    }
    const moderasyon = await moderateDraft({
      draft: uretim.draft,
      kaynakMetni: kaynak.metin,
      konuOdagi,
      uretenProvider: uretim.uretenProvider,
      config,
    });
    console.log(
      `[aday] "${uretim.draft.frontmatter.baslik}" tur ${tur + 1}: skor ${moderasyon.skor}` +
        (moderasyon.sertRed ? " (sert red)" : moderasyon.otomatikYayinaUygun ? " (otomatik seviye)" : "")
    );
    if (!enIyi || moderasyon.skor > enIyi.moderasyon.skor) enIyi = { draft: uretim.draft, moderasyon };
    if (moderasyon.sertRed || moderasyon.otomatikYayinaUygun || !moderasyon.duzeltmeNotlari) break;
    notlar = moderasyon.duzeltmeNotlari;
  }

  if (!enIyi) {
    return { durum: "red", sebep: `üretim: ${uretimHatasi}`, kaliciRed: false };
  }
  const { draft, moderasyon } = enIyi;
  if (!moderasyon.gecti) {
    return {
      durum: "red",
      sebep: moderasyon.redSebebi,
      skor: moderasyon.skor,
      baslik: draft.frontmatter.baslik,
      kaliciRed: true,
    };
  }

  // 4. Görsel + yayın
  const otomatik = moderasyon.otomatikYayinaUygun && !config.provaModu;
  const cover = await generateCoverImage({
    slug: draft.slug,
    baslik: draft.frontmatter.baslik,
    kategori,
    gorselAramaTerimi: sinif.siniflandirma.gorselAramaTerimi,
  });
  const yayin = await publishDraft({
    draft,
    cover,
    otomatikYayinlandi: otomatik,
    moderasyonSkoru: moderasyon.skor,
    konuOdagi,
    hakemModel: moderasyon.detaylar.hakemProvider,
  });
  if (aday.kaynak === "evergreen") await markEvergreenUsed(aday.baslik);

  // 5. Dağıtım ya da onay bildirimi
  if (otomatik) {
    await distributeContent({ frontmatter: draft.frontmatter, publicUrl: yayin.publicUrl });
    await notifyAdmin(
      `✅ Otomatik yayınlandı (skor ${moderasyon.skor}): <b>${escapeHtml(draft.frontmatter.baslik)}</b>\n${yayin.publicUrl}`
    );
  } else {
    await notifyAdmin(onayMesaji(draft, moderasyon, yayin, config.provaModu));
  }

  return {
    durum: otomatik ? "otomatik" : "onay",
    skor: moderasyon.skor,
    baslik: draft.frontmatter.baslik,
    kaliciRed: false,
  };
}
