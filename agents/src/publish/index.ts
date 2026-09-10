import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { POSTS_DIR } from "../lib/paths.js";
import { serializePostToMarkdown } from "../lib/markdown.js";
import { appendPublishedEntry, konuParmakIzi } from "../lib/state.js";
import type { PostDraft } from "../lib/schemas.js";
import type { CoverImageResult } from "../image/index.js";

export interface PublishResult {
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
 * Bu, ilk aşamada branch/PR-per-item otomasyonundan daha basit ve yeterlidir.
 */
export async function publishDraft(params: {
  draft: PostDraft;
  cover: CoverImageResult;
  otomatikYayinlandi: boolean;
  moderasyonSkoru: number;
  hakemModel?: string;
}): Promise<PublishResult> {
  const { draft, cover, otomatikYayinlandi, moderasyonSkoru, hakemModel } = params;

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

  await mkdir(POSTS_DIR, { recursive: true });
  const dosyaYolu = path.join(POSTS_DIR, `${draft.slug}.md`);
  const markdown = serializePostToMarkdown(tamFrontmatter, draft.govdeMarkdown);
  await writeFile(dosyaYolu, markdown, "utf-8");

  await appendPublishedEntry({
    slug: draft.slug,
    baslik: draft.frontmatter.baslik,
    konuParmakIzi: konuParmakIzi(draft.frontmatter.baslik),
    kategori: draft.frontmatter.kategori,
    format: draft.frontmatter.format,
    yayinTarihi: new Date().toISOString(),
    otomatikYayinlandi,
  });

  return {
    dosyaYolu,
    publicUrl: `https://sosyektif.com/${draft.slug}/`,
    otomatikYayinlandi,
  };
}
