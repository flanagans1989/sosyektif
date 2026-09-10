import { postToPublicChannel } from "../lib/telegram.js";
import { postSkeet } from "../lib/bluesky.js";
import { FORMAT_ETIKETLERI_TR } from "../lib/formatLabels.js";
import type { Post } from "../lib/schemas.js";

/**
 * Faz 1 dağıtım kanalları: Telegram + Bluesky — ikisi de ücretsiz ve onay
 * süreci gerektirmiyor (PLAN.md §3.6). X ücretli olduğu için yok; Instagram/
 * Threads Meta app review gerektirdiği için Faz 2'ye ertelendi.
 */
export async function distributeContent(params: {
  frontmatter: Post;
  publicUrl: string;
}): Promise<void> {
  const { frontmatter, publicUrl } = params;
  const etiket = FORMAT_ETIKETLERI_TR[frontmatter.format];

  const telegramMetni = `🆕 <b>${etiket}</b>\n${frontmatter.baslik}\n\n${frontmatter.metaAciklama}\n\n${publicUrl}`;
  const blueskyMetni = `${frontmatter.baslik}\n\n${frontmatter.metaAciklama}`;

  await Promise.all([
    postToPublicChannel(telegramMetni).catch((err) =>
      console.error("[distribute] telegram hata:", err)
    ),
    postSkeet(blueskyMetni, publicUrl).catch((err) =>
      console.error("[distribute] bluesky hata:", err)
    ),
  ]);
}
