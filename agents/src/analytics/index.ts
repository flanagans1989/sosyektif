import { fetchPageviewsByPath } from "./cloudflare.js";
import { fetchSearchConsoleClicksByPath } from "./searchConsole.js";
import { readPublishedIndex, writeCategoryWeights } from "../lib/state.js";
import { KATEGORILER } from "../lib/schemas.js";
import { notifyAdmin } from "../lib/telegram.js";

/**
 * Site yeniyken (az yazı varken) tek bir erken yazının şansına aldığı
 * trafik bile toplam sinyalin neredeyse tamamını oluşturuyor — bu da
 * "eşit dağılım" isteğinin tam tersi, aşırı sivri bir ağırlığa yol açıyor
 * (ör. 4 yazıdan 3'ü bilimse bilim anında baskın kategori oluyor).
 * Yeterli sayıda yazı birikene kadar (kategori başına en az birkaç yazı
 * ortalaması) tüm kategoriler bilerek eşit tutulur; siteye içerik
 * biriktikçe performans sinyali organik olarak devreye girer.
 */
const MIN_TOPLAM_YAYIN_ESIGI = KATEGORILER.length * 5;

/**
 * Haftalık analitik geri besleme (PLAN.md §3.7): hangi kategori daha çok
 * ilgi görüyorsa Trend Ajanı'nın konu seçiminde o kategoriye biraz daha
 * ağırlık verilir. Ağırlıklar asla sıfıra inmez (0.5 taban) — az veri olan
 * yeni kategoriler tamamen elenmesin diye.
 */
export async function updateCategoryWeights(): Promise<Record<string, number>> {
  const publishedIndex = await readPublishedIndex();

  if (publishedIndex.length < MIN_TOPLAM_YAYIN_ESIGI) {
    // Henüz yeterli veri yok — tüm kategoriler eşit ağırlıkta kalır.
    const agirliklar = Object.fromEntries(KATEGORILER.map((k) => [k, 1]));
    await writeCategoryWeights(agirliklar);
    return agirliklar;
  }

  const [pageviews, searchClicks] = await Promise.all([
    fetchPageviewsByPath(),
    fetchSearchConsoleClicksByPath(),
  ]);

  const slugToKategori = new Map(publishedIndex.map((e) => [e.slug, e.kategori]));

  const kategoriPuanlari: Record<string, number> = Object.fromEntries(
    KATEGORILER.map((k) => [k, 0])
  );

  for (const [yol, sayi] of Object.entries(pageviews)) {
    const kategori = slugToKategori.get(yol);
    if (kategori) kategoriPuanlari[kategori] = (kategoriPuanlari[kategori] ?? 0) + sayi;
  }
  for (const [yol, sayi] of Object.entries(searchClicks)) {
    const kategori = slugToKategori.get(yol);
    if (kategori) kategoriPuanlari[kategori] = (kategoriPuanlari[kategori] ?? 0) + sayi * 2; // arama tıklaması daha değerli sinyal
  }

  const toplam = Object.values(kategoriPuanlari).reduce((a, b) => a + b, 0);
  const agirliklar: Record<string, number> = {};

  if (toplam === 0) {
    // Henüz veri yok (yeni site) — tüm kategoriler eşit ağırlıkta başlar.
    for (const k of KATEGORILER) agirliklar[k] = 1;
  } else {
    for (const k of KATEGORILER) {
      const oran = (kategoriPuanlari[k] ?? 0) / toplam;
      agirliklar[k] = Math.max(0.5, 0.5 + oran * KATEGORILER.length);
    }
  }

  await writeCategoryWeights(agirliklar);
  return agirliklar;
}

async function main() {
  const agirliklar = await updateCategoryWeights();
  const ozet = Object.entries(agirliklar)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}: ${v.toFixed(2)}`)
    .join("\n");
  await notifyAdmin(`📊 <b>Haftalık kategori ağırlıkları güncellendi</b>\n${ozet}`);
  console.log("Kategori ağırlıkları güncellendi:\n" + ozet);
}

// Doğrudan çalıştırıldığında (tsx src/analytics/index.ts) main() çalışır.
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[analytics] hata:", err);
      process.exit(1);
    });
}
