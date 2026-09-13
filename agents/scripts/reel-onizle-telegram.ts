/**
 * Bir içeriğin Reels videosunu üretip "✅ Reels olarak paylaş / ❌ Paylaşma"
 * butonlarıyla admin Telegram'ına gönderir (bkz. src/distribute/reel.ts).
 * Kullanıcı "genelde dışarıda oluyorum, Telegram'dan izleyip onay versem"
 * dediği için eklendi. Kendisi paylaşım yapmaz — ✅'e basılınca worker
 * reel-paylas.yml'i başlatır.
 *
 * `--muzik-karsilastir`: aynı videoyu kütüphanedeki her müzikle ayrı ayrı
 * gönderir (butonsuz) — hangi parçaların kalacağına kullanıcı karar verir.
 *
 * Asıl kullanım GitHub Actions üzerinden: .github/workflows/reel-onizle-telegram.yml
 * (workflow_dispatch — Actions sekmesinden ya da GitHub mobil uygulamasından).
 *
 * Kullanım: npm run reel-onizle-telegram -- <slug> [--muzik-karsilastir]
 */
import { icerigiOku, muzikKarsilastirmasiGonder, reeliOnayaGonder } from "../src/distribute/reel.js";

const slug = process.argv[2];
if (!slug || slug.startsWith("--")) {
  console.error("Kullanım: npm run reel-onizle-telegram -- <slug> [--muzik-karsilastir]");
  process.exit(1);
}

const icerik = await icerigiOku(slug);
if (process.argv.includes("--muzik-karsilastir")) {
  console.log("Müzik karşılaştırması hazırlanıyor...");
  await muzikKarsilastirmasiGonder(icerik);
  console.log("Tüm müzik seçenekleri gönderildi.");
} else {
  console.log("Reels üretiliyor...");
  await reeliOnayaGonder(icerik, slug);
  console.log("Telegram'a onay butonlarıyla gönderildi.");
}
