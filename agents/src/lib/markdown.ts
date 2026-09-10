import yaml from "js-yaml";
import type { Post } from "./schemas.js";

/**
 * Post frontmatter'ını + gövde metnini, site/src/content.config.ts'in
 * glob loader'ının okuyabileceği bir .md dosyasına serileştirir.
 */
export function serializePostToMarkdown(frontmatter: Post, govdeMarkdown: string): string {
  // Date nesnelerini ISO string'e çevir — js-yaml Date'i kendi formatında
  // yazar, Astro'nun z.coerce.date() ile uyumlu olsun diye string'e sabitliyoruz.
  const serializable = {
    ...frontmatter,
    yayinTarihi: frontmatter.yayinTarihi.toISOString(),
    guncellemeTarihi: frontmatter.guncellemeTarihi?.toISOString(),
  };

  const frontmatterYaml = yaml.dump(serializable, {
    noRefs: true,
    lineWidth: -1,
    sortKeys: false,
  });

  return `---\n${frontmatterYaml}---\n\n${govdeMarkdown.trim()}\n`;
}
