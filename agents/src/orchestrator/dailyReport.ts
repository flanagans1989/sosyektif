import { readConfig, readPublishedIndex, readRunSummary } from "../lib/state.js";
import { notifyAdmin } from "../lib/telegram.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { DATA_DIR } from "../lib/paths.js";

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

  // Kanal/token/anahtar kontrolleri artık sağlık denetiminde (saglikDenetimi.ts,
  // 6 saatte bir). Burada yalnızca özetini ve denetimin kendisinin çalışıp
  // çalışmadığını gösteriyoruz — gözetimi de gözetle.
  try {
    const saglik = JSON.parse(await readFile(path.join(DATA_DIR, "saglik.json"), "utf-8")) as {
      sonDenetim: string;
      sorunlar: Record<string, { durum: string }>;
    };
    const saat = (Date.now() - new Date(saglik.sonDenetim).getTime()) / (60 * 60 * 1000);
    const sorunlar = Object.values(saglik.sorunlar);
    const hata = sorunlar.filter((s) => s.durum === "hata").length;
    satirlar.push(
      sorunlar.length === 0
        ? `🩺 Sistem sağlığı: her şey çalışıyor (son denetim ${Math.round(saat)} saat önce)`
        : `🩺 Sistem sağlığı: ${hata} hata, ${sorunlar.length - hata} uyarı açık (ayrıntılar sağlık denetimi mesajında)`
    );
    if (saat > 8) satirlar.push("⚠️ Sağlık denetimi 8 saattir çalışmadı — saglik-denetimi.yml'i kontrol et.");
  } catch {
    satirlar.push("⚠️ Sağlık denetimi kaydı yok — saglik-denetimi.yml hiç çalışmamış olabilir.");
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
