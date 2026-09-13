/**
 * Instagram Reels/Facebook video'yu yayınlanmış içeriklerden yerelde üretir —
 * reel-onizle önce yayınlanmasın diye (bkz. config.json reelsAktif bayrağı,
 * varsayılan kapalı). Paylaşım yapmaz, commit etmez. ffmpeg'in yerelde kurulu
 * olması gerekir.
 *
 * Kullanım: npm run reel-onizle -- <slug>
 * Çıktı: agents/slayt-onizleme/<slug>/reel.mp4 (git'e girmez)
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { generateCarouselSlides } from "../src/image/social.js";
import { slaytlardanReelUret } from "../src/image/reelRender.js";
import { POSTS_DIR, REPO_ROOT } from "../src/lib/paths.js";
import type { Post } from "../src/lib/schemas.js";

const slug = process.argv[2];
if (!slug) {
  console.error("Kullanım: npm run reel-onizle -- <slug>");
  process.exit(1);
}

const md = await readFile(path.join(POSTS_DIR, `${slug}.md`), "utf8");
const frontmatter = yaml.load(md.split(/^---$/m)[1] ?? "") as Post;
const cikti = path.join(REPO_ROOT, "agents", "slayt-onizleme", slug);
await mkdir(cikti, { recursive: true });

console.log("Slaytlar render ediliyor...");
const slaytlar = await generateCarouselSlides(frontmatter);
console.log(`${slaytlar.length} slayttan video üretiliyor (ffmpeg)...`);
const video = await slaytlardanReelUret(slaytlar);
await writeFile(path.join(cikti, "reel.mp4"), video);
console.log(`${slug}: reel → ${path.join(cikti, "reel.mp4")}`);
