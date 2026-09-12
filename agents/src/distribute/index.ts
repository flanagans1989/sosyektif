import { postToPublicChannel } from "../lib/telegram.js";
import { postSkeet } from "../lib/bluesky.js";
import { postToThreads } from "../lib/threads.js";
import { postToInstagram } from "../lib/instagram.js";
import { FORMAT_ETIKETLERI_TR } from "../lib/formatLabels.js";
import { generateCarouselSlides, writeCarouselSlides } from "../image/social.js";
import type { Post } from "../lib/schemas.js";

/**
 * Dağıtım kanalları (PLAN.md §3.6, Bölüm 11.2): Telegram + Bluesky (Faz 1,
 * her zaman denenir) ve Threads + Instagram (Faz 3, token yoksa/süresi
 * dolmuşsa sessizce atlanır — R5 deseni). X ücretli olduğu için yok.
 */
export async function distributeContent(params: {
  frontmatter: Post;
  slug: string;
  publicUrl: string;
}): Promise<void> {
  const { frontmatter, slug, publicUrl } = params;
  const etiket = FORMAT_ETIKETLERI_TR[frontmatter.format];

  const telegramMetni = `🆕 <b>${etiket}</b>\n${frontmatter.baslik}\n\n${frontmatter.metaAciklama}\n\n${publicUrl}`;
  const blueskyMetni = `${frontmatter.baslik}\n\n${frontmatter.metaAciklama}`;
  const threadsMetni = `${frontmatter.baslik}\n\n${frontmatter.metaAciklama}`;
  const instagramMetni = `${frontmatter.baslik}\n\n${frontmatter.metaAciklama}\n\nDetaylar ve devamı için bio'daki linke bak 👆\n\n#sosyektif #${frontmatter.kategori}`;

  await Promise.all([
    postToPublicChannel(telegramMetni).catch((err) =>
      console.error("[distribute] telegram hata:", err)
    ),
    postSkeet(blueskyMetni, publicUrl).catch((err) =>
      console.error("[distribute] bluesky hata:", err)
    ),
    postToThreads(threadsMetni, publicUrl).catch((err) =>
      console.error("[distribute] threads hata:", err)
    ),
    (async () => {
      try {
        const slaytlar = await generateCarouselSlides(frontmatter);
        const urls = await writeCarouselSlides(slug, slaytlar);
        await postToInstagram(instagramMetni, urls);
      } catch (err) {
        console.error("[distribute] instagram hata:", err);
      }
    })(),
  ]);
}
