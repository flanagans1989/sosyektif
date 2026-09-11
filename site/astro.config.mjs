// @ts-check
import { defineConfig } from 'astro/config';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import { KATEGORILER } from './src/lib/kategoriler.ts';

// İçeriği olmayan kategori sayfalarını site haritasından (ve Google'ın
// indeksinden) dışarıda tutmak için, build sırasında hangi kategorilerde
// yayınlanmış yazı olduğunu ham front-matter taramasıyla buluyoruz.
// (Layout.astro'daki noindex mantığıyla aynı kural: taslak olmayan +
// kategorisi eşleşen yazı sayısı 0 ise o kategori "boş" sayılır.)
function bosKategorileriBul() {
  const postsDir = fileURLToPath(new URL('./src/content/posts/', import.meta.url));
  const doluKategoriler = new Set();

  let dosyalar = [];
  try {
    dosyalar = readdirSync(postsDir).filter((d) => d.endsWith('.md') || d.endsWith('.mdx'));
  } catch {
    return [];
  }

  for (const dosya of dosyalar) {
    // Yazılar Windows'ta (CRLF) üretilebiliyor; \r'yi normalize etmeden
    // regex'lerdeki $ satır sonuna denk gelmiyor.
    const icerik = readFileSync(postsDir + dosya, 'utf-8').replace(/\r\n/g, '\n');
    const frontMatter = icerik.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
    const taslak = /^taslak:\s*true\s*$/m.test(frontMatter);
    const kategoriEslesme = frontMatter.match(/^kategori:\s*['"]?([\w-]+)['"]?\s*$/m);
    if (!taslak && kategoriEslesme) {
      doluKategoriler.add(kategoriEslesme[1]);
    }
  }

  return Object.keys(KATEGORILER).filter((k) => !doluKategoriler.has(k));
}

const bosKategoriYollari = new Set(
  bosKategorileriBul().map((k) => `https://sosyektif.com/kategori/${k}/`)
);

// https://astro.build/config
export default defineConfig({
  site: 'https://sosyektif.com',

  vite: {
    plugins: [tailwindcss()]
  },

  integrations: [
    sitemap({
      filter: (sayfa) => !bosKategoriYollari.has(sayfa)
    })
  ]
});
