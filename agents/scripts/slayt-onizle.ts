/**
 * Instagram carousel slaytlarını yayınlanmış içeriklerden yerelde üretir —
 * şablon (src/image/socialSablon.ts) üzerinde çalışırken sonucu görmek için.
 * Paylaşım yapmaz, commit etmez.
 *
 * Kullanım: npm run slayt-onizle -- <slug> [<slug> ...]
 * Çıktı: agents/slayt-onizleme/<slug>/N.jpg (git'e girmez)
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { generateCarouselSlides } from "../src/image/social.js";
import { POSTS_DIR, REPO_ROOT } from "../src/lib/paths.js";
import type { Post } from "../src/lib/schemas.js";

const sluglar = process.argv.slice(2);
if (!sluglar.length) {
  console.error("Kullanım: npm run slayt-onizle -- <slug> [<slug> ...]");
  process.exit(1);
}

for (const slug of sluglar) {
  const md = await readFile(path.join(POSTS_DIR, `${slug}.md`), "utf8");
  const frontmatter = yaml.load(md.split(/^---$/m)[1] ?? "") as Post;
  const cikti = path.join(REPO_ROOT, "agents", "slayt-onizleme", slug);
  await mkdir(cikti, { recursive: true });
  const slaytlar = await generateCarouselSlides(frontmatter);
  for (const [i, slayt] of slaytlar.entries()) {
    await writeFile(path.join(cikti, `${i + 1}.jpg`), slayt);
  }
  console.log(`${slug}: ${slaytlar.length} slayt → ${cikti}`);
}
