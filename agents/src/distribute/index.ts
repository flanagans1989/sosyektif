import { postToPublicChannel } from "../lib/telegram.js";
import { postSkeet } from "../lib/bluesky.js";
import { postToThreads } from "../lib/threads.js";
import { postToInstagram } from "../lib/instagram.js";
import { postToFacebook } from "../lib/facebook.js";
import { FORMAT_ETIKETLERI_TR, FORMAT_EMOJI, KATEGORI_EMOJI } from "../lib/formatLabels.js";
import { generateCarouselSlides, writeCarouselSlides } from "../image/social.js";
import { dosyalariHemenYayinla, canliyaCikanaKadarBekle } from "../lib/gitYayinla.js";
import type { Post } from "../lib/schemas.js";

/**
 * Dağıtım kanalları (PLAN.md §3.6, Bölüm 11.2): Telegram + Bluesky (Faz 1,
 * her zaman denenir) ve Threads + Instagram + Facebook Sayfası (Faz 3, token
 * yoksa/süresi dolmuşsa sessizce atlanır — R5 deseni). X ücretli olduğu için
 * yok. Facebook, Instagram için zaten üretilip canlıya çıkarılan carousel
 * görsellerini yeniden kullanır (bkz. aşağıdaki IIFE).
 */
export async function distributeContent(params: {
  frontmatter: Post;
  slug: string;
  publicUrl: string;
}): Promise<void> {
  const { frontmatter, slug, publicUrl } = params;
  const etiket = FORMAT_ETIKETLERI_TR[frontmatter.format];
  const formatEmoji = FORMAT_EMOJI[frontmatter.format];
  const kategoriEmoji = KATEGORI_EMOJI[frontmatter.kategori] ?? "🔍";

  const telegramMetni = `${formatEmoji} <b>${etiket}</b>\n\n${frontmatter.baslik}\n\n${frontmatter.metaAciklama}\n\n👉 ${publicUrl}`;
  const blueskyMetni = `${formatEmoji} ${frontmatter.baslik}\n\n${frontmatter.metaAciklama}`;
  const threadsMetni = `${formatEmoji} ${frontmatter.baslik}\n\n${frontmatter.metaAciklama}`;
  const instagramMetni = `${formatEmoji} ${frontmatter.baslik}\n\n${frontmatter.metaAciklama}\n\n👆 Detaylar ve devamı bio'daki linkte\n\n${kategoriEmoji} #sosyektif #${frontmatter.kategori} #${frontmatter.format}`;
  // Facebook, Instagram'dan farklı olarak tıklanabilir link destekliyor.
  const facebookMetni = `${formatEmoji} ${frontmatter.baslik}\n\n${frontmatter.metaAciklama}\n\n👉 ${publicUrl}\n\n${kategoriEmoji} #sosyektif #${frontmatter.kategori} #${frontmatter.format}`;

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
        const yazilanlar = await writeCarouselSlides(slug, slaytlar);
        const urls = yazilanlar.map((y) => y.url);

        // Kritik: bu görseller normalde pipeline SONUNDA commit'lenir, ama
        // Instagram'ın çekeceği URL'in paylaşım anında zaten canlı olması
        // gerekiyor — yoksa görselsiz/kırık paylaşım gider (bkz. gitYayinla.ts
        // başlık yorumu, 2026-09-13'te gerçek paylaşımda tespit edildi).
        const dosyalar = yazilanlar.map((y) => y.dosyaYolu);
        const pushEdildi = dosyalariHemenYayinla(
          dosyalar,
          `Sosyal medya görselleri: ${slug} (${dosyalar.length} slayt)`
        );
        if (!pushEdildi) {
          console.warn("[distribute] görseller push edilemedi, Instagram paylaşımı atlanıyor");
          return;
        }
        const canli = await canliyaCikanaKadarBekle(urls);
        if (!canli) {
          console.warn(
            "[distribute] görseller zaman aşımına uğradı (Cloudflare Pages build gecikti?), Instagram/Facebook paylaşımı atlanıyor"
          );
          return;
        }
        await Promise.all([
          postToInstagram(instagramMetni, urls).catch((err) =>
            console.error("[distribute] instagram hata:", err)
          ),
          postToFacebook(facebookMetni, urls).catch((err) =>
            console.error("[distribute] facebook hata:", err)
          ),
        ]);
      } catch (err) {
        console.error("[distribute] görsel üretim/yayın hata:", err);
      }
    })(),
  ]);
}
