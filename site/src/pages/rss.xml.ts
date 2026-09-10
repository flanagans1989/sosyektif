import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';

export async function GET(context: APIContext) {
  const yazilar = await getCollection('posts', ({ data }) => !data.taslak);
  const siralanmis = yazilar.sort(
    (a, b) => b.data.yayinTarihi.valueOf() - a.data.yayinTarihi.valueOf()
  );

  return rss({
    title: 'sosyektif',
    description: 'Gündemi, ilginç bilgileri ve eğlenceli listeleri bir araya getiren içerik platformu.',
    site: context.site ?? 'https://sosyektif.com',
    items: siralanmis.map((yazi) => ({
      title: yazi.data.baslik,
      description: yazi.data.metaAciklama,
      pubDate: yazi.data.yayinTarihi,
      link: `/${yazi.id}/`,
    })),
    customData: '<language>tr-tr</language>',
  });
}
