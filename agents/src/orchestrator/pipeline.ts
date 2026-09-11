import {
  readConfig,
  writeConfig,
  readPublishedIndex,
  writeRunSummary,
  readCategoryWeights,
  addRejected,
  yakindaReddedilenler,
  konuParmakIzi,
} from "../lib/state.js";
import { gatherTrendCandidates } from "../trend/index.js";
import { processCandidate } from "./processCandidate.js";
import { kutlaBugunkuOzelGunler } from "../distribute/kutlama.js";
import { notifyAdmin, escapeHtml } from "../lib/telegram.js";
import type { TrendCandidate } from "../lib/schemas.js";

const MAX_DENENECEK_ADAY = 10;
/** GitHub Actions job'u 15 dk'da kesilir; yeni adaya başlamayı 9 dk'da bırak. */
const ZAMAN_BUTCESI_MS = 9 * 60 * 1000;

/**
 * Kaynak güvenilirliği: bir adayın gerçekten içeriğe dönüşme ihtimali.
 * İlk sürümde YouTube şarkı/oyun videoları ham ilgi skoruyla en üste çıkıyor,
 * Vikipedi karşılığı olmadığı için hepsi eleniyordu. Vikipedi'nin en çok
 * okunanları ve evergreen havuzu kaynağı hazır konular olduğu için öne alınır.
 */
const KAYNAK_GUVENI: Record<TrendCandidate["kaynak"], number> = {
  "ozel-gun": 1.2,
  wikipedia: 1,
  evergreen: 0.95,
  "google-trends": 0.75,
  "google-news": 0.6,
  reddit: 0.4,
  youtube: 0.35,
};

function bugununTarihi(): string {
  return new Date().toISOString().slice(0, 10);
}

async function bugunUretilenSayisi(): Promise<number> {
  const index = await readPublishedIndex();
  const bugun = bugununTarihi();
  return index.filter((e) => e.yayinTarihi.slice(0, 10) === bugun).length;
}

async function siraliAdaylar(): Promise<TrendCandidate[]> {
  const [adaylar, agirliklar, reddedilenler] = await Promise.all([
    gatherTrendCandidates(),
    readCategoryWeights(),
    yakindaReddedilenler(),
  ]);
  const puan = (a: TrendCandidate) =>
    KAYNAK_GUVENI[a.kaynak] * (0.4 + 0.6 * a.tahminiIlgi) * (a.kategoriTahmini ? agirliklar[a.kategoriTahmini] ?? 1 : 1);

  return adaylar
    .filter((a) => !reddedilenler.has(konuParmakIzi(a.baslik)))
    .sort((a, b) => puan(b) - puan(a));
}

async function main() {
  const baslangic = Date.now();
  const config = await readConfig();

  if (config.paused) {
    console.log(`[pipeline] duraklatılmış (${config.pausedReason ?? "sebep belirtilmemiş"}), çıkılıyor`);
    return;
  }

  // Günün özel gün kutlaması, içerik günlük kotasından bağımsız her çalışmada kontrol edilir.
  await kutlaBugunkuOzelGunler(config).catch((err) =>
    console.error("[pipeline] kutlama kontrolü hata:", err)
  );

  // Elle tetiklenen çalıştırmalarda (GUNLUK_HEDEF_ATLA=1) günlük hedef kontrolü atlanır.
  const hedefAtla = process.env.GUNLUK_HEDEF_ATLA === "1";
  const bugunUretilen = await bugunUretilenSayisi();
  if (!hedefAtla && bugunUretilen >= config.gunlukHedefIcerikSayisi) {
    console.log(`[pipeline] bugünkü hedefe ulaşıldı (${bugunUretilen}/${config.gunlukHedefIcerikSayisi})`);
    return;
  }

  const adaylar = await siraliAdaylar();
  console.log(`[pipeline] ${adaylar.length} aday; ilk ${MAX_DENENECEK_ADAY} denenecek (prova modu: ${config.provaModu})`);

  const hatalar: string[] = [];
  let otomatikYayinlanan = 0;
  let onayaDusen = 0;
  let denemeSayisi = 0;

  for (const aday of adaylar.slice(0, MAX_DENENECEK_ADAY)) {
    if (Date.now() - baslangic > ZAMAN_BUTCESI_MS) {
      hatalar.push("zaman bütçesi doldu, kalan adaylar sonraki çalışmaya kaldı");
      break;
    }
    denemeSayisi++;
    console.log(`[pipeline] aday ${denemeSayisi}: [${aday.kaynak}] ${aday.baslik}`);
    try {
      const sonuc = await processCandidate(aday, config);
      if (sonuc.durum === "otomatik") otomatikYayinlanan++;
      if (sonuc.durum === "onay") onayaDusen++;
      if (sonuc.durum !== "red") break; // bu çalışma için bir içerik yeterli

      hatalar.push(`${aday.baslik}: ${sonuc.sebep}`);
      if (sonuc.kaliciRed) await addRejected(aday.baslik, sonuc.sebep ?? "red");
    } catch (err) {
      hatalar.push(`${aday.baslik}: beklenmeyen hata: ${err instanceof Error ? err.message : err}`);
    }
  }

  const uretilenToplam = otomatikYayinlanan + onayaDusen;
  const basarili = uretilenToplam > 0;

  // Config'i yeniden oku: çalışma sırasında elle yapılan değişiklikleri
  // (ör. eşik ayarı, duraklatma) ezmemek için yalnızca sayaç alanları güncellenir.
  const guncel = await readConfig();
  if (basarili) {
    guncel.ardisikBasarisizCalisma = 0;
  } else {
    guncel.ardisikBasarisizCalisma += 1;
    if (guncel.ardisikBasarisizCalisma >= guncel.ardisikBasarisizCalismaLimiti) {
      guncel.paused = true;
      guncel.pausedReason = `${guncel.ardisikBasarisizCalisma} ardışık başarısız çalışma`;
      await notifyAdmin(
        `🛑 Pipeline otomatik duraklatıldı: ${guncel.ardisikBasarisizCalisma} ardışık başarısız çalışma.\n` +
          `Son hatalar:\n${escapeHtml(hatalar.slice(-3).join("\n"))}`
      );
    }
  }
  await writeConfig(guncel);

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
  if (hatalar.length > 0) console.log("[pipeline] elenenler:\n" + hatalar.join("\n"));
}

main().catch((err) => {
  console.error("[pipeline] beklenmeyen hata:", err);
  process.exit(1);
});
