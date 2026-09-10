import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Repo kökünü bulur: agents/src/lib'den yukarı çıkıp PLAN.md'nin
 * bulunduğu klasörü arar. cwd'nin agents/ veya repo kökü olması fark etmez.
 */
function findRepoRoot(): string {
  let dir = here;
  for (let i = 0; i < 6; i++) {
    if (existsSync(path.join(dir, "PLAN.md"))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error(
    "Repo kökü bulunamadı (PLAN.md aranıyor). agents/ klasörünün repo içinde olduğundan emin ol."
  );
}

export const REPO_ROOT = findRepoRoot();
export const DATA_DIR = path.join(REPO_ROOT, "data");
export const SITE_DIR = path.join(REPO_ROOT, "site");
export const POSTS_DIR = path.join(SITE_DIR, "src", "content", "posts");
export const IMAGES_DIR = path.join(SITE_DIR, "public", "images", "posts");

export const PATHS = {
  config: path.join(DATA_DIR, "config.json"),
  blocklist: path.join(DATA_DIR, "blocklist.json"),
  evergreen: path.join(DATA_DIR, "evergreen.json"),
  publishedIndex: path.join(DATA_DIR, "published-index.json"),
  categoryWeights: path.join(DATA_DIR, "category-weights.json"),
  runLog: path.join(DATA_DIR, "last-run.json"),
} as const;
