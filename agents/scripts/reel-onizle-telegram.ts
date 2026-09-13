/**
 * Bir içeriğin Reels videosunu üretip "✅ Reels olarak paylaş / ❌ Paylaşma"
 * butonlarıyla admin Telegram'ına gönderir (bkz. src/distribute/reel.ts).
 * Kullanıcı "genelde dışarıda oluyorum, Telegram'dan izleyip onay versem"
 * dediği için eklendi. Kendisi paylaşım yapmaz — ✅'e basılınca worker
 * reel-paylas.yml'i başlatır.
 *
 * Asıl kullanım GitHub Actions üzerinden: .github/workflows/reel-onizle-telegram.yml
 * (workflow_dispatch, `slug` girdisi — Actions sekmesinden ya da GitHub mobil
 * uygulamasından tetiklenebilir).
 *
 * Kullanım: npm run reel-onizle-telegram -- <slug>
 */
import { icerigiOku, reeliOnayaGonder } from "../src/distribute/reel.js";

const slug = process.argv[2];
if (!slug) {
  console.error("Kullanım: npm run reel-onizle-telegram -- <slug>");
  process.exit(1);
}

console.log("Reels üretiliyor...");
await reeliOnayaGonder(await icerigiOku(slug), slug);
console.log("Telegram'a onay butonlarıyla gönderildi.");
