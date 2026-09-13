/**
 * reel-onizle.ts ile aynı işi yapar ama dosyayı diske yazmak yerine
 * doğrudan yöneticinin Telegram'ına video olarak gönderir — kullanıcı
 * "genelde dışarıda oluyorum, Telegram'dan izleyip onay versem" dediği için
 * eklendi. Yerelde ffmpeg gerektirdiğinden asıl kullanım şekli GitHub
 * Actions üzerinden: bkz. .github/workflows/reel-onizle-telegram.yml
 * (workflow_dispatch, `slug` girdisiyle Actions sekmesinden ya da GitHub
 * mobil uygulamasından tetiklenebilir). Paylaşım yapmaz, commit etmez.
 *
 * Kullanım: npm run reel-onizle-telegram -- <slug>
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { generateCarouselSlides } from "../src/image/social.js";
import { slaytlardanReelUret } from "../src/image/reelRender.js";
import { sendVideoToAdmin } from "../src/lib/telegram.js";
import { POSTS_DIR } from "../src/lib/paths.js";
import type { Post } from "../src/lib/schemas.js";

const slug = process.argv[2];
if (!slug) {
  console.error("Kullanım: npm run reel-onizle-telegram -- <slug>");
  process.exit(1);
}

const md = await readFile(path.join(POSTS_DIR, `${slug}.md`), "utf8");
const frontmatter = yaml.load(md.split(/^---$/m)[1] ?? "") as Post;

console.log("Slaytlar render ediliyor...");
const slaytlar = await generateCarouselSlides(frontmatter);
console.log(`${slaytlar.length} slayttan video üretiliyor (ffmpeg)...`);
const video = await slaytlardanReelUret(slaytlar);

console.log("Telegram'a gönderiliyor...");
await sendVideoToAdmin(
  video,
  `🎬 <b>Reel önizlemesi</b>: ${frontmatter.baslik}\n\nBu paylaşım yapılmadı — sadece önizleme. Beğenirsen data/config.json'da reelsAktif: true yap.`
);
console.log("Gönderildi.");
