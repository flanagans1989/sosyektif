import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { POSTS_DIR } from "../lib/paths.js";
import { serializePostToMarkdown } from "../lib/markdown.js";
import { appendPublishedEntry, konuParmakIzi } from "../lib/state.js";
import type { PostDraft } from "../lib/schemas.js";
import type { CoverImageResult } from "../image/index.js";

export interface PublishResult {
  slug: string;
  dosyaYolu: string;
  publicUrl: string;
  otomatikYayinlandi: boolean;
}

/**
 * İçeriği site/src/content/posts'a yazar.
 *
 * Not: Bu fonksiyon git commit YAPMAZ — commit, GitHub Actions workflow'unda
 * bir çalışmadaki tüm üretilen dosyalar için TEK seferde yapılır (PLAN.md §9,
 * "ayda ~500 build limiti" hesabı buna dayanır).
 *
 * Onaya düşen içerikler de (otomatikYayinlandi: false) buraya `taslak: true`
 * olarak yazılır — Astro'nun `!data.taslak` filtresi sayesinde siteye
 * çıkmazlar, ama repo'da durup admin onayıyla `taslak: false`'a çevrilebilir.
 */
export async function publishDraft(params: {
  draft: PostDraft;
  cover: CoverImageResult;
  otomatikYayinlandi: boolean;
  moderasyonSkoru: number;
  /** Tekrar kontrolünün anahtarı: aynı konu farklı başlıkla tekrar işlenmesin. */
  konuOdagi: string;
  hakemModel?: string;
}): Promise<PublishResult> {
  const { draft, cover, otomatikYayinlandi, moderasyonSkoru, konuOdagi, hakemModel } = params;

  await mkdir(POSTS_DIR, { recursive: true });
  let slug = draft.slug;
  for (let i = 2; existsSync(path.join(POSTS_DIR, `${slug}.md`)); i++) {
    slug = `${draft.slug}-${i}`;
  }

  const tamFrontmatter = {
    ...draft.frontmatter,
    kapakGorseli: cover.publicPath,
    kapakGorselAlt: cover.alt,
    gorselKredisi: cover.kredi,
    taslak: !otomatikYayinlandi,
    moderasyon: {
      skor: moderasyonSkoru,
      otomatikYayinlandi,
      hakemModel,
    },
  };

  const dosyaYolu = path.join(POSTS_DIR, `${slug}.md`);
  await writeFile(dosyaYolu, serializePostToMarkdown(tamFrontmatter, draft.govdeMarkdown), "utf-8");

  await appendPublishedEntry({
    slug,
    baslik: draft.frontmatter.baslik,
    konuParmakIzi: konuParmakIzi(konuOdagi),
    kategori: draft.frontmatter.kategori,
    format: draft.frontmatter.format,
    yayinTarihi: new Date().toISOString(),
    otomatikYayinlandi,
  });

  return {
    slug,
    dosyaYolu,
    publicUrl: `https://sosyektif.com/${slug}/`,
    otomatikYayinlandi,
  };
}
