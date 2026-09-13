/**
 * Telegram'da onaylanan Reels'i Instagram + Facebook'ta paylaşır (bkz.
 * src/distribute/reel.ts). Worker'ın reel_ok butonu .github/workflows/reel-paylas.yml
 * üzerinden çağırır; elle de çalıştırılabilir.
 *
 * Kullanım: npm run reel-paylas -- <slug>
 */
import { reeliPaylas } from "../src/distribute/reel.js";

const slug = process.argv[2];
if (!slug) {
  console.error("Kullanım: npm run reel-paylas -- <slug>");
  process.exit(1);
}

await reeliPaylas(slug);
console.log(`${slug}: Reels paylaşıldı.`);
