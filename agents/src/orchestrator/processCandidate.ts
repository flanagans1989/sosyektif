import { classifyTopic, generateContentDraft } from "../content/index.js";
import { gatherSourceFor } from "../content/sourceGathering.js";
import { moderateDraft } from "../moderation/index.js";
import { generateCoverImage } from "../image/index.js";
import { publishDraft, type PublishResult } from "../publish/index.js";
import { bildirIndexNow } from "../lib/indexnow.js";
import { notifyAdmin, notifyAdminOnayButonlu, escapeHtml } from "../lib/telegram.js";
import {
  konuDahaOnceIslendiMi,
  markEvergreenUsed,
  ozelGunIcerikUretildiMi,
  markOzelGunIcerikUretildi,
  readPublishedIndex,
  type Config,
} from "../lib/state.js";
import { FORMAT_ETIKETLERI_TR } from "../lib/formatLabels.js";
import type { Format, ModerationResult, PostDraft, TrendCandidate } from "../lib/schemas.js";

export interface AdaySonucu {
  durum: "otomatik" | "onay" | "red";
  sebep?: string;
  skor?: number;
  baslik?: string;
  /** true ise konu bir süre tekrar denenmez (uygunsuz/kaynaksız/düşük kalite). */
  kaliciRed: boolean;
}

const REPO = process.env.GITHUB_REPOSITORY ?? "flanagans1989/sosyektif";

/**
 * Özel gün adaylarının başlığı "<ad> (<yıl>)" biçimindedir (bkz.
 * trend/ozelGunler.ts). Yıl bazlı üretim-idempotenslik kontrolü için ikisini
 * ayırır.
 */
function ozelGunAdiVeYili(baslik: string): { ad: string; yil: number } | null {
  const eslesme = baslik.match(/^(.*) \((\d{4})\)$/);
  return eslesme ? { ad: eslesme[1]!, yil: Number(eslesme[2]) } : null;
}

const FORMATLAR: Format[] = ["liste", "trivia", "quiz", "kisilik"];
const DENGE_PENCERESI = 8;

/**
 * Format çeşitliliği: tüm formatlar eşit ağırlıkta. Sınıflandırıcı neredeyse
 * her konuya "liste" öneriyordu; site tek tip içeriğe dönüyor, Günün Sorusu
 * havuzu da boş kalıyordu. Son yayınlarda EN AZ kullanılmış formatı seçer;
 * birden fazla format eşit azsa ve öneri aralarındaysa öneriye uyar.
 * Kişilik testi yalnızca konu uygunsa (4-6 üyeli bir küme) aday olur.
 */
async function formatDengele(onerilen: Format, kisilikUygun: boolean): Promise<Format> {
  const son = (await readPublishedIndex()).slice(-DENGE_PENCERESI).map((e) => e.format);
  const adaylar = FORMATLAR.filter((f) => f !== "kisilik" || kisilikUygun);
  const kullanim = (f: Format) => son.filter((x) => x === f).length;
  const enAz = Math.min(...adaylar.map(kullanim));
  const enAzKullanilanlar = adaylar.filter((f) => kullanim(f) === enAz);
  return enAzKullanilanlar.includes(onerilen) ? onerilen : enAzKullanilanlar[0]!;
}

function onayMesaji(draft: PostDraft, moderasyon: ModerationResult, yayin: PublishResult, provaModu: boolean): string {
  const fm = draft.frontmatter;
  const maddeBasliklari =
    fm.format === "quiz"
      ? (fm.quizSorulari ?? []).map((s) => s.soru)
      : fm.format === "kisilik"
        ? (fm.kisilikSonuclari ?? []).map((s) => s.baslik)
        : (fm.listeMaddeleri ?? []).map((m) => m.baslik);
  const birim = fm.format === "quiz" ? "soru" : fm.format === "kisilik" ? "sonuç" : "madde";
  const d = moderasyon.detaylar;
  const puanlar = d.hakemCalisti ? `doğruluk ${d.dogrulukPuani}/5 · değer ${d.degerPuani}/5` : "hakem çalışmadı";

  const satirlar = [
    `⏳ <b>Onay bekliyor</b> — skor ${moderasyon.skor} (${puanlar})${provaModu ? " · prova modu" : ""}`,
    "",
    `<b>${escapeHtml(fm.baslik)}</b>`,
    `${fm.kategori} · ${FORMAT_ETIKETLERI_TR[fm.format]} · ${maddeBasliklari.length} ${birim}`,
    "",
    ...maddeBasliklari.slice(0, 6).map((b) => `• ${escapeHtml(b)}`),
  ];
  if (maddeBasliklari.length > 6) satirlar.push(`• … (+${maddeBasliklari.length - 6})`);
  if (moderasyon.duzeltmeNotlari) {
    satirlar.push("", `<i>Denetçi notları:</i>\n${escapeHtml(moderasyon.duzeltmeNotlari.slice(0, 600))}`);
  }
  satirlar.push(
    "",
    `Aşağıdaki butonla onaylayabilir ya da reddedebilirsin.`,
    `<i>(Buton çalışmazsa manuel düzenleme: <a href="https://github.com/${REPO}/edit/main/site/src/content/posts/${yayin.slug}.md">GitHub'da aç</a> — taslak: true → false)</i>`
  );
  return satirlar.join("\n");
}

/**
 * Tek bir aday için tam zincir:
 * sınıflandırma → kaynak → taslak → moderasyon (→ gerekirse 1 revizyon) → görsel → yayın/onay.
 */
export async function processCandidate(aday: TrendCandidate, config: Config): Promise<AdaySonucu> {
  // Özel günler (bayramlar vb.) her yıl yeniden işlenmesi GEREKEN tek kalıcı-
  // tekrar istisnasıdır. Aynı yıl içinde (aday "oncedenGun" penceresinde her
  // çalışmada tekrar geldiği için) ikinci kez üretilmesini engeller.
  const ozelGun = aday.kaynak === "ozel-gun" ? ozelGunAdiVeYili(aday.baslik) : null;
  if (ozelGun && (await ozelGunIcerikUretildiMi(ozelGun.ad, ozelGun.yil))) {
    return { durum: "red", sebep: `"${ozelGun.ad}" (${ozelGun.yil}) için içerik zaten üretildi`, kaliciRed: false };
  }

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
  const onerilenFormat = aday.formatOnerisi ?? sinif.siniflandirma.formatOnerisi;
  // Özel günlerin formatı elle seçildiği için dengelemeye girmez.
  const format = ozelGun
    ? onerilenFormat
    : await formatDengele(onerilenFormat, sinif.siniflandirma.kisilikTestiUygun);

  // Özel günler için kalıcı tekrar kontrolü bilerek atlanır (yukarıdaki
  // yıl bazlı kontrol zaten aynı yıl içinde tekrarı engelliyor); aksi halde
  // ilk yıl yayınlanan bir bayram konusu sonraki yıllarda hep engellenirdi.
  if (!ozelGun && (await konuDahaOnceIslendiMi(konuOdagi))) {
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
    // Eşit skorda, düzeltme turundan geçip otomatik yayın seviyesine ulaşan
    // sürüm tercih edilir — yoksa bir önceki (düzeltilmemiş, onaya düşen)
    // sürüm "en iyi" sayılmaya devam eder ve otomatik yayın hakkı kaybolur.
    if (
      !enIyi ||
      moderasyon.skor > enIyi.moderasyon.skor ||
      (moderasyon.skor === enIyi.moderasyon.skor &&
        moderasyon.otomatikYayinaUygun &&
        !enIyi.moderasyon.otomatikYayinaUygun)
    ) {
      enIyi = { draft: uretim.draft, moderasyon };
    }
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
  if (ozelGun) await markOzelGunIcerikUretildi(ozelGun.ad, ozelGun.yil);

  // 5. Onay bildirimi. Sosyal medya dağıtımı artık burada yapılmıyor:
  // pipeline bitip içerik canlıya çıktıktan sonra dağıtım kuyruğu
  // (distribute/kuyruk.ts, dagitim.yml) otomatik ve elle onaylanan TÜM
  // içerikleri paylaşır, başarısız kanalları tekrar dener.
  if (otomatik) {
    await bildirIndexNow(yayin.publicUrl);
    await notifyAdmin(
      `✅ Otomatik yayınlandı (skor ${moderasyon.skor}): <b>${escapeHtml(draft.frontmatter.baslik)}</b>\n${yayin.publicUrl}\n📣 Sosyal medya paylaşımı birkaç dakika içinde dağıtım kuyruğundan yapılacak.`
    );
  } else {
    await notifyAdminOnayButonlu(onayMesaji(draft, moderasyon, yayin, config.provaModu), yayin.slug);
  }

  return {
    durum: otomatik ? "otomatik" : "onay",
    skor: moderasyon.skor,
    baslik: draft.frontmatter.baslik,
    kaliciRed: false,
  };
}
