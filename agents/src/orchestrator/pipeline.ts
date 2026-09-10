import { readConfig, writeConfig, readPublishedIndex, writeRunSummary, readCategoryWeights, markEvergreenUsed } from "../lib/state.js";
import { gatherTrendCandidates } from "../trend/index.js";
import { classifyTopic, generateContentDraft } from "../content/index.js";
import { moderateDraft } from "../moderation/index.js";
import { generateCoverImage } from "../image/index.js";
import { publishDraft } from "../publish/index.js";
import { distributeContent } from "../distribute/index.js";
import { notifyAdmin } from "../lib/telegram.js";
import type { TrendCandidate } from "../lib/schemas.js";

const MAX_DENENECEK_ADAY = 6;

function bugununTarihi(): string {
  return new Date().toISOString().slice(0, 10);
}

async function bugunUretilenSayisi(): Promise<number> {
  const index = await readPublishedIndex();
  const bugun = bugununTarihi();
  return index.filter((e) => e.yayinTarihi.slice(0, 10) === bugun).length;
}

async function agirlikliSirala(adaylar: TrendCandidate[]): Promise<TrendCandidate[]> {
  const agirliklar = await readCategoryWeights();
  return [...adaylar].sort((a, b) => {
    const aSkor = a.tahminiIlgi * (a.kategoriTahmini ? agirliklar[a.kategoriTahmini] ?? 1 : 1);
    const bSkor = b.tahminiIlgi * (b.kategoriTahmini ? agirliklar[b.kategoriTahmini] ?? 1 : 1);
    return bSkor - aSkor;
  });
}

interface DenemeSonucu {
  basarili: boolean;
  otomatikYayinlandi: boolean;
  sebep?: string;
}

async function tekAdayiIsle(aday: TrendCandidate, onayaDusEsigi: number, otomatikYayinEsigi: number): Promise<DenemeSonucu> {
  // 1. Sınıflandırma (evergreen'de zaten kategori/format belli, yine de hassasiyet kontrolü yapılır)
  const siniflandirma = await classifyTopic(aday.baslik);
  if (!siniflandirma.uygun) {
    return { basarili: false, otomatikYayinlandi: false, sebep: `sınıflandırma: ${siniflandirma.sebep}` };
  }

  const kategori = aday.kategoriTahmini ?? siniflandirma.siniflandirma!.kategori;
  const format = aday.formatOnerisi ?? siniflandirma.siniflandirma!.formatOnerisi;

  // 2. İçerik üretimi (kaynak + LLM)
  const uretim = await generateContentDraft({ konuBasligi: aday.baslik, kategori, format });
  if (!uretim.basarili || !uretim.draft || !uretim.kaynak || !uretim.uretenProvider) {
    return { basarili: false, otomatikYayinlandi: false, sebep: `üretim: ${uretim.sebep}` };
  }

  // 3. Moderasyon
  const config = await readConfig();
  const moderasyon = await moderateDraft({
    draft: uretim.draft,
    kaynakMetni: uretim.kaynak.ozetMetni,
    uretenProvider: uretim.uretenProvider,
    config,
  });

  if (!moderasyon.gecti) {
    return { basarili: false, otomatikYayinlandi: false, sebep: `moderasyon reddi: ${moderasyon.redSebebi}` };
  }

  // 4. Görsel
  const cover = await generateCoverImage({
    slug: uretim.draft.slug,
    baslik: uretim.draft.frontmatter.baslik,
    kategori,
  });

  // 5. Yayın (otomatik ya da onaya düşen taslak olarak)
  const otomatikYayinlandi = moderasyon.otomatikYayinaUygun;
  const yayin = await publishDraft({
    draft: uretim.draft,
    cover,
    otomatikYayinlandi,
    moderasyonSkoru: moderasyon.skor,
  });

  if (aday.kaynak === "evergreen") {
    await markEvergreenUsed(aday.baslik);
  }

  // 6. Dağıtım (sadece otomatik yayınlananlar için) / onay bildirimi
  if (otomatikYayinlandi) {
    await distributeContent({ frontmatter: uretim.draft.frontmatter, publicUrl: yayin.publicUrl });
    await notifyAdmin(
      `✅ Otomatik yayınlandı (skor ${moderasyon.skor.toFixed(2)}): <b>${uretim.draft.frontmatter.baslik}</b>\n${yayin.publicUrl}`
    );
  } else if (moderasyon.skor >= onayaDusEsigi) {
    await notifyAdmin(
      `⏳ Onayını bekliyor (skor ${moderasyon.skor.toFixed(2)}): <b>${uretim.draft.frontmatter.baslik}</b>\n` +
        `Dosya: ${yayin.dosyaYolu}\n` +
        `Onaylamak için frontmatter'da taslak: false yap ve commit et.`
    );
  }
  // skor onayaDusEsigi'nin de altındaysa dosya taslak olarak kalır ama admin'i meşgul etmez.

  return { basarili: true, otomatikYayinlandi, sebep: moderasyon.redSebebi };
}

async function main() {
  const config = await readConfig();

  if (config.paused) {
    console.log(`[pipeline] duraklatılmış (${config.pausedReason ?? "sebep belirtilmemiş"}), çıkılıyor`);
    return;
  }

  const bugunUretilen = await bugunUretilenSayisi();
  if (bugunUretilen >= config.gunlukHedefIcerikSayisi) {
    console.log(`[pipeline] bugünkü hedefe ulaşıldı (${bugunUretilen}/${config.gunlukHedefIcerikSayisi})`);
    return;
  }

  const hamAdaylar = await gatherTrendCandidates();
  const adaylar = await agirlikliSirala(hamAdaylar);

  const hatalar: string[] = [];
  let otomatikYayinlanan = 0;
  let onayaDusen = 0;
  let denemeSayisi = 0;

  for (const aday of adaylar.slice(0, MAX_DENENECEK_ADAY)) {
    denemeSayisi++;
    try {
      const sonuc = await tekAdayiIsle(aday, config.onayaDusEsigi, config.otomatikYayinEsigi);
      if (sonuc.basarili) {
        if (sonuc.otomatikYayinlandi) otomatikYayinlanan++;
        else onayaDusen++;
        break; // bu çalışma için bir içerik üretmek yeterli
      } else {
        hatalar.push(`${aday.baslik}: ${sonuc.sebep}`);
      }
    } catch (err) {
      hatalar.push(`${aday.baslik}: beklenmeyen hata: ${err instanceof Error ? err.message : err}`);
    }
  }

  const uretilenToplam = otomatikYayinlanan + onayaDusen;
  const basarili = uretilenToplam > 0;

  const yeniConfig = { ...config };
  if (basarili) {
    yeniConfig.ardisikBasarisizCalisma = 0;
  } else {
    yeniConfig.ardisikBasarisizCalisma += 1;
    if (yeniConfig.ardisikBasarisizCalisma >= config.ardisikBasarisizCalismaLimiti) {
      yeniConfig.paused = true;
      yeniConfig.pausedReason = `${yeniConfig.ardisikBasarisizCalisma} ardışık başarısız çalışma`;
      await notifyAdmin(
        `🛑 Pipeline otomatik duraklatıldı: ${yeniConfig.ardisikBasarisizCalisma} ardışık başarısız çalışma.\n` +
          `Son hatalar:\n${hatalar.slice(-3).join("\n")}`
      );
    }
  }
  await writeConfig(yeniConfig);

  await writeRunSummary({
    tarih: new Date().toISOString(),
    basarili,
    uretilenIcerikSayisi: uretilenToplam,
    otomatikYayinlanan,
    onayaDusen,
    reddedilen: denemeSayisi - uretilenToplam,
    hatalar,
  });

  console.log(
    `[pipeline] tamamlandı: ${uretilenToplam} üretildi (${otomatikYayinlanan} otomatik, ${onayaDusen} onay bekliyor), ${denemeSayisi} aday denendi`
  );
  if (hatalar.length > 0) console.log("[pipeline] hatalar:\n" + hatalar.join("\n"));
}

main().catch((err) => {
  console.error("[pipeline] beklenmeyen hata:", err);
  process.exit(1);
});
