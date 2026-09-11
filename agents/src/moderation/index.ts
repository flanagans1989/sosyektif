import { z } from "zod";
import { checkBlocklist } from "../lib/blocklist.js";
import { ngramOverlapScore } from "../lib/similarity.js";
import { konuDahaOnceIslendiMi, type Config } from "../lib/state.js";
import { chatCompleteExcluding, type ProviderName } from "../lib/llmRouter.js";
import { parseJsonLoose } from "../lib/json.js";
import { HAKEM_SISTEM_PROMPTU, hakemKullaniciPromptu } from "../content/prompts.js";
import type { PostDraft, ModerationResult } from "../lib/schemas.js";

/**
 * Moderasyon iki tür sorunu ayırır:
 *  - SERT RED: kara liste, tekrar konu, hassas içerik → düzeltilemez, konu atlanır.
 *  - YUMUŞAK SORUN: dayanaksız detay, başlık-madde uyumsuzluğu, kaynağa fazla
 *    benzerlik, kısa maddeler, düşük okur değeri → puanı düşürür ve yazara
 *    düzeltme notu olarak geri gönderilir (pipeline bir revizyon turu yapar).
 *
 * Skor = (0.6·doğruluk + 0.4·değer) × (0.6 + 0.4·yapı). Böylece doğru ve
 * düzgün bir içerik ~0.8+ alır; ciddi hata/çelişki onay eşiğinin altına iner.
 */

const hakemSchema = z.object({
  dayanaksizIddialar: z.array(z.string()).catch([]),
  dilHatalari: z.array(z.string()).catch([]),
  celiskiVarMi: z.boolean().catch(false),
  baslikYaniltici: z.boolean().catch(false),
  hassasIcerik: z.boolean().catch(false),
  dogrulukPuani: z.coerce.number().min(1).max(5),
  degerPuani: z.coerce.number().min(1).max(5),
  duzeltmeNotlari: z.string().catch(""),
});
type HakemYaniti = z.infer<typeof hakemSchema>;

const BENZERLIK_ESIGI = 0.5;

function maddeler(draft: PostDraft): { baslik: string; metin: string }[] {
  const fm = draft.frontmatter;
  if (fm.format === "quiz") {
    return (fm.quizSorulari ?? []).map((s) => ({ baslik: s.soru, metin: s.aciklama ?? "" }));
  }
  if (fm.format === "kisilik") {
    return (fm.kisilikSorulari ?? []).map((s) => ({ baslik: s.soru, metin: "" }));
  }
  return fm.listeMaddeleri ?? [];
}

/** Hakeme ve benzerlik kontrolüne verilen düz metin. */
function draftToPlainText(draft: PostDraft): string {
  const fm = draft.frontmatter;
  const satirlar = [`BAŞLIK: ${fm.baslik}`, `GİRİŞ: ${draft.govdeMarkdown}`];
  if (fm.format === "quiz") {
    (fm.quizSorulari ?? []).forEach((s, i) => {
      satirlar.push(
        `${i + 1}. SORU: ${s.soru}\n   ŞIKLAR: ${s.secenekler.join(" | ")}\n   DOĞRU: ${s.secenekler[s.dogruIndex] ?? "?"}\n   AÇIKLAMA: ${s.aciklama ?? ""}`
      );
    });
  } else if (fm.format === "kisilik") {
    const sonuclar = fm.kisilikSonuclari ?? [];
    const sonucAdi = new Map(sonuclar.map((s) => [s.id, s.baslik]));
    satirlar.push("SONUÇLAR:");
    sonuclar.forEach((s) => satirlar.push(`- ${s.baslik}: ${s.aciklama}`));
    satirlar.push("SORULAR:");
    (fm.kisilikSorulari ?? []).forEach((s, i) => {
      const siklar = s.secenekler.map((o) => `${o.metin} → ${sonucAdi.get(o.sonucId) ?? "?"}`).join(" | ");
      satirlar.push(`${i + 1}. SORU: ${s.soru}\n   ŞIKLAR: ${siklar}`);
    });
  } else {
    (fm.listeMaddeleri ?? []).forEach((m, i) => satirlar.push(`${i + 1}. ${m.baslik}\n   ${m.metin}`));
  }
  return satirlar.join("\n");
}

/** Ucuz, deterministik yapı kontrolleri → 0..1 puan + yazara notlar. */
function yapiKontrolu(draft: PostDraft): { skor: number; notlar: string[] } {
  const fm = draft.frontmatter;
  const notlar: string[] = [];
  let skor = 1;
  const liste = maddeler(draft);
  const n = liste.length;
  const min = fm.format === "liste" ? 5 : fm.format === "trivia" ? 3 : fm.format === "kisilik" ? 5 : 4;
  const birim = fm.format === "quiz" || fm.format === "kisilik" ? "soru" : "madde";

  if (n < min) {
    skor -= 0.4;
    notlar.push(`En az ${min} ${birim} olmalı (şu an ${n}).`);
  }

  const sayi = fm.baslik.match(/(?<![\p{L}\p{N}])(\d{1,2})(?![\p{L}\p{N}])/u);
  if (sayi && Number(sayi[1]) !== n) {
    skor -= 0.3;
    notlar.push(`Başlıktaki sayı (${sayi[1]}) ile ${birim} sayısı (${n}) aynı olmalı.`);
  }

  if (fm.format === "kisilik") {
    const sonuclar = fm.kisilikSonuclari ?? [];
    if (sonuclar.length < 4) {
      skor -= 0.4;
      notlar.push(`En az 4 sonuç olmalı (şu an ${sonuclar.length}).`);
    }
    const kullanilan = new Set((fm.kisilikSorulari ?? []).flatMap((s) => s.secenekler.map((o) => o.sonucId)));
    const ulasilamayan = sonuclar.filter((s) => !kullanilan.has(s.id)).length;
    if (ulasilamayan > 0) {
      skor -= 0.2;
      notlar.push(`${ulasilamayan} sonuca hiçbir şık bağlanmamış; her sonuç birkaç şıkta geçmeli ki çıkabilsin.`);
    }
    const kisaSonuc = sonuclar.filter((s) => s.aciklama.trim().length < 80).length;
    if (kisaSonuc > 0) {
      skor -= Math.min(0.3, kisaSonuc * 0.1);
      notlar.push(`${kisaSonuc} sonucun açıklaması çok kısa; her sonucu 2-4 cümleye çıkar.`);
    }
  }

  if (fm.format === "liste" || fm.format === "trivia") {
    const kisalar = liste.filter((m) => m.metin.trim().length < 60).length;
    if (kisalar > 0) {
      skor -= Math.min(0.3, kisalar * 0.1);
      notlar.push(`${kisalar} maddenin metni çok kısa; her maddeyi 2-4 cümleye çıkar.`);
    }
  }

  const benzersiz = new Set(liste.map((m) => m.baslik.toLocaleLowerCase("tr").trim()));
  if (benzersiz.size < n) {
    skor -= 0.2;
    notlar.push("Tekrarlanan madde başlıkları var; her madde farklı bir bilgi vermeli.");
  }

  if (draft.govdeMarkdown.trim().length < 40) {
    skor -= 0.1;
    notlar.push("Giriş paragrafı çok kısa; 2-3 cümlelik bir kanca yaz.");
  }

  return { skor: Math.max(0, skor), notlar };
}

export interface ModerateParams {
  draft: PostDraft;
  kaynakMetni: string;
  /** Tekrar kontrolü için sınıflandırmanın bulduğu konu odağı. */
  konuOdagi: string;
  uretenProvider: ProviderName;
  config: Config;
}

export async function moderateDraft(params: ModerateParams): Promise<ModerationResult> {
  const { draft, kaynakMetni, konuOdagi, uretenProvider, config } = params;
  const tamMetin = draftToPlainText(draft);

  const bosDetay = {
    karaListeIhlali: false,
    benzerlikSkoru: 0,
    hakemCalisti: false,
    dogrulukPuani: null,
    degerPuani: null,
    celiskiVarMi: null,
    baslikYaniltici: null,
    dayanaksizIddialar: [],
    tekrarMi: false,
  };
  const sertRed = (sebep: string, ek: Partial<ModerationResult["detaylar"]>): ModerationResult => ({
    gecti: false,
    sertRed: true,
    skor: 0,
    otomatikYayinaUygun: false,
    redSebebi: sebep,
    detaylar: { ...bosDetay, ...ek },
  });

  // 1. Kara liste: konu listesi yalnızca başlıkta; gövdede yalnızca kesin
  //    yasak kelimeler. (Gövdede "saldırı", "ölüm" gibi kelimeler bir hayvanın
  //    avlanması ya da tarihî bir olayın anlatımında doğal olarak geçer;
  //    bağlam değerlendirmesi hakemin işi.)
  const baslikKontrol = await checkBlocklist(draft.frontmatter.baslik);
  const govdeKontrol = await checkBlocklist(tamMetin, { sadeceKesinKelimeler: true });
  const ihlaller = [...baslikKontrol.eslesenTerimler, ...govdeKontrol.eslesenTerimler];
  if (ihlaller.length > 0) {
    return sertRed(`Kara liste ihlali: ${[...new Set(ihlaller)].join(", ")}`, { karaListeIhlali: true });
  }

  // 2. Tekrar konu
  if (await konuDahaOnceIslendiMi(konuOdagi)) {
    return sertRed("Bu konu daha önce işlenmiş", { tekrarMi: true });
  }

  // 3. Kaynağa aşırı benzerlik (kopyalama)
  const benzerlikSkoru = ngramOverlapScore(tamMetin, kaynakMetni);

  // 4. Yapı
  const yapi = yapiKontrolu(draft);

  // 5. Hakem — üretenden farklı bir sağlayıcı
  let hakem: HakemYaniti | null = null;
  let hakemProvider: ProviderName | undefined;
  let hakemHatasi: string | undefined;
  try {
    const { text, provider } = await chatCompleteExcluding(uretenProvider, {
      systemPrompt: HAKEM_SISTEM_PROMPTU,
      userPrompt: hakemKullaniciPromptu({ uretilenIcerik: tamMetin, kaynakMetni }),
      jsonMode: true,
      temperature: 0.1,
    });
    hakem = parseJsonLoose(text, hakemSchema);
    hakemProvider = provider;
  } catch (err) {
    hakemHatasi = err instanceof Error ? err.message : String(err);
  }

  const detaylar = {
    ...bosDetay,
    benzerlikSkoru,
    hakemCalisti: hakem !== null,
    dogrulukPuani: hakem?.dogrulukPuani ?? null,
    degerPuani: hakem?.degerPuani ?? null,
    celiskiVarMi: hakem?.celiskiVarMi ?? null,
    baslikYaniltici: hakem?.baslikYaniltici ?? null,
    dayanaksizIddialar: hakem?.dayanaksizIddialar ?? [],
    hakemProvider,
  };

  if (hakem?.hassasIcerik) {
    return { ...sertRed("Hakem hassas içerik tespit etti", {}), detaylar: { ...detaylar } };
  }

  // Skor
  let skor: number;
  if (hakem) {
    const dogruluk = (hakem.dogrulukPuani - 1) / 4;
    const deger = (hakem.degerPuani - 1) / 4;
    skor = (0.6 * dogruluk + 0.4 * deger) * (0.6 + 0.4 * yapi.skor);
    if (hakem.celiskiVarMi) skor = Math.min(skor, 0.45);
    if (hakem.baslikYaniltici) skor -= 0.15;
  } else {
    // Hakem çalışmadıysa içerik en fazla onay kuyruğuna gidebilir.
    skor = 0.7 * yapi.skor;
  }
  if (benzerlikSkoru > BENZERLIK_ESIGI) skor = Math.min(skor, 0.5);
  skor = Math.round(Math.max(0, Math.min(1, skor)) * 100) / 100;

  // Yazara geri gidecek düzeltme notları
  const notlar = [...yapi.notlar];
  if (benzerlikSkoru > BENZERLIK_ESIGI) {
    notlar.push("Metin kaynak cümlelerine çok yakın; tüm cümleleri tamamen kendi üslubunla yeniden kur.");
  }
  if (hakem?.dayanaksizIddialar.length) {
    notlar.push(
      `Şu iddiaları kaynağa uygun düzelt ya da çıkar: ${hakem.dayanaksizIddialar.slice(0, 5).join("; ")}`
    );
  }
  if (hakem?.dilHatalari.length) {
    notlar.push(`Şu yazım/dil hatalarını düzelt: ${hakem.dilHatalari.slice(0, 8).join("; ")}`);
  }
  if (hakem?.duzeltmeNotlari.trim()) notlar.push(hakem.duzeltmeNotlari.trim());

  // Bilinen bir hata (dayanaksız iddia, dil hatası) içeren içerik puanı ne olursa
  // olsun kendiliğinden yayınlanmaz; pipeline önce notlarla revizyon dener.
  const bilinenHataVar = Boolean(hakem?.dayanaksizIddialar.length || hakem?.dilHatalari.length);

  const gecti = skor >= config.onayaDusEsigi;
  const otomatikYayinaUygun =
    gecti &&
    hakem !== null &&
    !bilinenHataVar &&
    !hakem.celiskiVarMi &&
    !hakem.baslikYaniltici &&
    benzerlikSkoru <= BENZERLIK_ESIGI &&
    skor >= config.otomatikYayinEsigi;

  return {
    gecti,
    sertRed: false,
    skor,
    otomatikYayinaUygun,
    redSebebi: gecti
      ? undefined
      : `Düşük skor (${skor})${hakemHatasi ? ` — hakem çalışmadı: ${hakemHatasi.slice(0, 120)}` : ""}${notlar.length ? ` — ${notlar.join(" ")}` : ""}`,
    duzeltmeNotlari: notlar.length ? notlar.map((n) => `- ${n}`).join("\n") : undefined,
    detaylar,
  };
}
