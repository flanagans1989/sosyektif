import { readConfig, readPublishedIndex, readRunSummary } from "../lib/state.js";
import { notifyAdmin } from "../lib/telegram.js";
import { getMetaToken } from "../lib/metaToken.js";

/**
 * Günde bir kez çalışır (.github/workflows/daily-report.yml). Sessiz
 * arızaları yakalamak için (PLAN.md R12): son çalışmanın özeti + 24 saattir
 * hiç yayın yoksa alarm.
 */
async function main() {
  const config = await readConfig();
  const sonCalisma = await readRunSummary();
  const index = await readPublishedIndex();

  const sonYayin = index.at(-1);
  const sonYayinZamanAsimi = sonYayin
    ? Date.now() - new Date(sonYayin.yayinTarihi).getTime()
    : Infinity;
  const yirmiDortSaatMs = 24 * 60 * 60 * 1000;

  const satirlar: string[] = ["📋 <b>Günlük sosyektif raporu</b>"];

  if (config.paused) {
    satirlar.push(`🛑 Pipeline duraklatılmış: ${config.pausedReason ?? "sebep yok"}`);
  }

  if (sonCalisma) {
    satirlar.push(
      `Son çalışma (${sonCalisma.tarih}): ` +
        `${sonCalisma.uretilenIcerikSayisi} üretildi ` +
        `(${sonCalisma.otomatikYayinlanan} otomatik, ${sonCalisma.onayaDusen} onay bekliyor, ${sonCalisma.reddedilen} reddedildi)`
    );
    if (sonCalisma.hatalar.length > 0) {
      satirlar.push(`Hatalar: ${sonCalisma.hatalar.length} adet (son çalışma logunda detay)`);
    }
  } else {
    satirlar.push("Henüz hiç pipeline çalışması kaydı yok.");
  }

  satirlar.push(`Toplam yayınlanan içerik: ${index.length}`);

  if (sonYayinZamanAsimi > yirmiDortSaatMs) {
    satirlar.push("⚠️ Son 24 saattir hiç yeni içerik yayınlanmadı — pipeline'ı kontrol et.");
  }

  // Meta (Threads/Instagram/Facebook) token'ları — süresi dolmadan önce
  // uyarmak, dolduktan sonra "paylaşım sessizce atlandı" diye fark etmemekten
  // iyidir (R5 deseni: token yoksa/dolmuşsa atlanır ama kimseye haber vermez,
  // bu kontrol o boşluğu kapatıyor).
  const BES_GUN_MS = 5 * 24 * 60 * 60 * 1000;
  for (const platform of ["threads", "instagram", "facebook"] as const) {
    const token = await getMetaToken(platform);
    if (!token) {
      satirlar.push(`⚠️ ${platform} token'ı yok/süresi dolmuş — paylaşımlar sessizce atlanıyor, yeniden bootstrap gerekebilir.`);
    } else if (token.expires_at !== 0 && token.expires_at - Date.now() < BES_GUN_MS) {
      const kalanGun = Math.round((token.expires_at - Date.now()) / (24 * 60 * 60 * 1000));
      satirlar.push(`⚠️ ${platform} token'ının süresi ${kalanGun} gün içinde doluyor.`);
    }
  }

  await notifyAdmin(satirlar.join("\n"));
  console.log(satirlar.join("\n"));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[daily-report] hata:", err);
    process.exit(1);
  });
