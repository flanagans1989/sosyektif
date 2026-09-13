/**
 * Reels videosunu yayınlanmış bir içerikten yerelde üretir — şablon
 * (src/image/reelSablon.ts) üzerinde çalışırken sonucu görmek için.
 * Paylaşım yapmaz, commit etmez.
 *
 * Kullanım:
 *   npm run reel-onizle -- <slug>              → reel.mp4
 *   npm run reel-onizle -- <slug> --kareler    → yalnızca birkaç kare (hızlı kontrol)
 * Çıktı: agents/slayt-onizleme/<slug>/ (git'e girmez)
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { reelKareleri, reelUret } from "../src/image/reelRender.js";
import { POSTS_DIR, REPO_ROOT } from "../src/lib/paths.js";
import type { Post } from "../src/lib/schemas.js";

const slug = process.argv[2];
const sadeceKareler = process.argv.includes("--kareler");
if (!slug) {
  console.error("Kullanım: npm run reel-onizle -- <slug> [--kareler]");
  process.exit(1);
}

const md = await readFile(path.join(POSTS_DIR, `${slug}.md`), "utf8");
const frontmatter = yaml.load(md.split(/^---$/m)[1] ?? "") as Post;
const cikti = path.join(REPO_ROOT, "agents", "slayt-onizleme", slug);
await mkdir(cikti, { recursive: true });

if (sadeceKareler) {
  const zamanlar = process.argv
    .slice(3)
    .filter((x) => /^\d+$/.test(x))
    .map(Number);
  const { kareler, sureMs } = await reelKareleri(
    frontmatter,
    zamanlar.length ? zamanlar : [300, 1200, 2600, 3700, 5500, 8000, 12000]
  );
  for (const [i, kare] of kareler.entries()) await writeFile(path.join(cikti, `kare-${i + 1}.jpg`), kare);
  console.log(`${slug}: ${kareler.length} kare (toplam süre ${sureMs}ms) → ${cikti}`);
} else {
  const baslangic = Date.now();
  const { video, sureMs } = await reelUret(frontmatter);
  await writeFile(path.join(cikti, "reel.mp4"), video);
  console.log(
    `${slug}: ${(sureMs / 1000).toFixed(1)}sn reel, ${(video.length / 1e6).toFixed(1)}MB, ` +
      `${((Date.now() - baslangic) / 1000).toFixed(0)}sn'de üretildi → ${path.join(cikti, "reel.mp4")}`
  );
}
