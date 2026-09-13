import { fetchSocialEngagement, nudgeCategoryWeightsBySocial } from "../analytics/socialPerformance.js";
import { notifyAdmin } from "../lib/telegram.js";
import { FORMAT_ETIKETLERI_TR } from "../lib/formatLabels.js";
import type { Format } from "../lib/schemas.js";

/**
 * Haftalık sosyal performans ajanı (.github/workflows/weekly-analytics.yml,
 * `analytics/index.ts`'ten SONRA çalışır). Son 14 günün Instagram/Facebook
 * etkileşimini ölçer, category-weights.json'a küçük bir sinyal olarak ekler
 * ve admin'e kısa bir özet gönderir.
 */
async function main() {
  const etkilesimler = await fetchSocialEngagement(14);

  if (etkilesimler.length === 0) {
    console.log("[sosyal-performans] son 14 günde ölçülecek sosyal paylaşım yok, atlanıyor");
    return;
  }

  await nudgeCategoryWeightsBySocial(etkilesimler);

  const siralanan = [...etkilesimler].sort((a, b) => b.toplam - a.toplam);
  const enIyiUcu = siralanan.slice(0, 3).filter((e) => e.toplam > 0);

  const formatToplam: Partial<Record<Format, number>> = {};
  for (const e of etkilesimler) {
    const format = e.format as Format;
    formatToplam[format] = (formatToplam[format] ?? 0) + e.toplam;
  }
  const enIyiFormat = Object.entries(formatToplam).sort(([, a], [, b]) => b - a)[0];

  const satirlar = ["📊 <b>Haftalık sosyal performans</b>", `Ölçülen paylaşım: ${etkilesimler.length}`];
  if (enIyiFormat && enIyiFormat[1] > 0) {
    const etiket = FORMAT_ETIKETLERI_TR[enIyiFormat[0] as Format] ?? enIyiFormat[0];
    satirlar.push(`En çok etkileşim alan format: ${etiket}`);
  }
  if (enIyiUcu.length > 0) {
    satirlar.push("", "En iyi paylaşımlar:");
    enIyiUcu.forEach((e, i) => satirlar.push(`${i + 1}. ${e.slug} (${e.kategori}) — ${e.toplam} puan`));
  } else {
    satirlar.push("Henüz ölçülebilir etkileşim yok (yeni hesap ya da token eksik).");
  }

  await notifyAdmin(satirlar.join("\n"));
  console.log(satirlar.join("\n"));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[sosyal-performans] hata:", err);
    process.exit(1);
  });
