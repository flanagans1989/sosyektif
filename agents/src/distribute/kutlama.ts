/**
 * Türkiye'deki milli/dini/özel günlerde (bkz. data/ozel-gunler.json) sitenin
 * kendisi henüz o güne özel bir yazı üretip onaylatmamış olsa bile, günün
 * kendisinde kısa bir kutlama mesajı paylaşılmasını sağlar. İçerik
 * pipeline'ından bağımsız çalışır (günlük hedef/kota kontrolüne takılmaz).
 *
 * Güvenlik: prova modu açıkken hiçbir şey otomatik paylaşılmaz — mesaj
 * sadece admin'e önizleme olarak gönderilir (processCandidate.ts'teki
 * otomatik yayın kuralıyla aynı prensip).
 */
import { postToPublicChannel, notifyAdmin, escapeHtml } from "../lib/telegram.js";
import { postSkeet } from "../lib/bluesky.js";
import { aktifOzelGunler } from "../trend/ozelGunler.js";
import { kutlamaGonderildiMi, markKutlamaGonderildi, type Config } from "../lib/state.js";

function kutlamaMetni(ad: string): string {
  return `🎉 ${ad} kutlu olsun!\n\nBu özel günle ilgili yazılarımıza göz atın: https://sosyektif.com`;
}

/** Bugün tam gününe denk gelen (kalanGun === 0), henüz kutlanmamış özel günler için mesaj paylaşır. */
export async function kutlaBugunkuOzelGunler(config: Config): Promise<void> {
  const bugunkuler = (await aktifOzelGunler(new Date())).filter((e) => e.kalanGun === 0);

  for (const { gun, hedefTarih } of bugunkuler) {
    const yil = hedefTarih.getUTCFullYear();
    if (await kutlamaGonderildiMi(gun.ad, yil)) continue;

    const metin = kutlamaMetni(gun.ad);
    if (config.provaModu) {
      await notifyAdmin(
        `🗓️ Bugün <b>${escapeHtml(gun.ad)}</b> — prova modu açık olduğu için aşağıdaki kutlama mesajı otomatik paylaşılmadı:\n\n${escapeHtml(metin)}`
      );
    } else {
      await Promise.all([
        postToPublicChannel(metin).catch((err) => console.error("[kutlama] telegram hata:", err)),
        postSkeet(metin, "https://sosyektif.com").catch((err) => console.error("[kutlama] bluesky hata:", err)),
      ]);
      await notifyAdmin(`✅ <b>${escapeHtml(gun.ad)}</b> kutlama mesajı paylaşıldı.`);
    }
    await markKutlamaGonderildi(gun.ad, yil);
  }
}
