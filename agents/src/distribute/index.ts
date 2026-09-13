import { postToPublicChannel } from "../lib/telegram.js";
import { postSkeet } from "../lib/bluesky.js";
import { postToThreads } from "../lib/threads.js";
import { postToInstagram } from "../lib/instagram.js";
import { postToFacebook } from "../lib/facebook.js";
import { FORMAT_ETIKETLERI_TR, FORMAT_EMOJI } from "../lib/formatLabels.js";
import { generateCarouselSlides, writeCarouselSlides } from "../image/social.js";
import { reeliOnayaGonder, sosyalMetinler } from "./reel.js";
import { dosyalariHemenYayinla, canliyaCikanaKadarBekle } from "../lib/gitYayinla.js";
import type { Post } from "../lib/schemas.js";

export interface DistributeResult {
  /** Her kanal için tek satırlık hata özeti — boşsa hiçbir sorun yok. Günlük
   * raporda/anlık admin bildiriminde gösterilir (bkz. orchestrator/dailyReport.ts). */
  basarisizlar: string[];
  /** Sosyal performans ajanı için paylaşılan gönderi ID'leri (atlanan/başarısız
   * platform için alan yok). */
  sosyalPaylasimlar: { threads?: string; instagram?: string; facebook?: string };
}

/**
 * Dağıtım kanalları (PLAN.md §3.6, Bölüm 11.2): Telegram + Bluesky (Faz 1,
 * her zaman denenir) ve Threads + Instagram + Facebook Sayfası (Faz 3, token
 * yoksa/süresi dolmuşsa sessizce atlanır — R5 deseni). X ücretli olduğu için
 * yok. Facebook, Instagram için zaten üretilip canlıya çıkarılan carousel
 * görsellerini yeniden kullanır (bkz. aşağıdaki IIFE).
 *
 * @param reelsAktif config.json'daki aynı adlı bayrak — açıksa Instagram/
 *   Facebook'a carousel gitmez; Reels videosu onay butonlarıyla admin
 *   Telegram'ına gönderilir (bkz. distribute/reel.ts). Varsayılan kapalı.
 */
export async function distributeContent(params: {
  frontmatter: Post;
  slug: string;
  publicUrl: string;
  reelsAktif: boolean;
}): Promise<DistributeResult> {
  const { frontmatter, slug, publicUrl, reelsAktif } = params;
  const etiket = FORMAT_ETIKETLERI_TR[frontmatter.format];
  const formatEmoji = FORMAT_EMOJI[frontmatter.format];

  const telegramMetni = `${formatEmoji} <b>${etiket}</b>\n\n${frontmatter.baslik}\n\n${frontmatter.metaAciklama}\n\n👉 ${publicUrl}`;
  const blueskyMetni = `${formatEmoji} ${frontmatter.baslik}\n\n${frontmatter.metaAciklama}`;
  const threadsMetni = `${formatEmoji} ${frontmatter.baslik}\n\n${frontmatter.metaAciklama}`;
    const metinler = sosyalMetinler(frontmatter, publicUrl);

  const basarisizlar: string[] = [];
  const sosyalPaylasimlar: DistributeResult["sosyalPaylasimlar"] = {};

  const [, , threadsId] = await Promise.all([
    postToPublicChannel(telegramMetni).catch((err) => {
      basarisizlar.push(`telegram: ${err instanceof Error ? err.message : err}`.slice(0, 200));
    }),
    postSkeet(blueskyMetni, publicUrl).catch((err) => {
      basarisizlar.push(`bluesky: ${err instanceof Error ? err.message : err}`.slice(0, 200));
    }),
    postToThreads(threadsMetni, publicUrl).catch((err) => {
      basarisizlar.push(`threads: ${err instanceof Error ? err.message : err}`.slice(0, 200));
      return null;
    }),
    (async () => {
      // Reels açıksa carousel yerine Reels videosu üretilip ONAY için admin
      // Telegram'ına gönderilir; Instagram/Facebook paylaşımı ✅ butonuna
      // basılınca reel-paylas.yml'de yapılır (bkz. distribute/reel.ts).
      if (reelsAktif) {
        await reeliOnayaGonder(frontmatter, slug).catch((err) => {
          basarisizlar.push(`reels onayı: ${err instanceof Error ? err.message : err}`.slice(0, 200));
        });
        return;
      }
      try {
        const dosyalar = await writeCarouselSlides(slug, await generateCarouselSlides(frontmatter));

        // Kritik: bu dosyalar normalde pipeline SONUNDA commit'lenir, ama
        // Instagram'ın çekeceği URL'in paylaşım anında zaten canlı olması
        // gerekiyor — yoksa görselsiz/kırık paylaşım gider (bkz. gitYayinla.ts
        // başlık yorumu, 2026-09-13'te gerçek paylaşımda tespit edildi).
        const pushEdildi = dosyalariHemenYayinla(
          dosyalar.map((d) => d.dosyaYolu),
          `Sosyal medya görselleri: ${slug} (${dosyalar.length} slayt)`
        );
        if (!pushEdildi) {
          basarisizlar.push("instagram+facebook: görseller push edilemedi");
          return;
        }
        const urls = dosyalar.map((d) => d.url);
        if (!(await canliyaCikanaKadarBekle(urls))) {
          basarisizlar.push("instagram+facebook: görseller zaman aşımına uğradı (Cloudflare Pages build gecikti?)");
          return;
        }

        const [igId, fbId] = await Promise.all([
          postToInstagram(metinler.instagram, urls).catch((err) => {
            basarisizlar.push(`instagram: ${err instanceof Error ? err.message : err}`.slice(0, 200));
            return null;
          }),
          postToFacebook(metinler.facebook, urls).catch((err) => {
            basarisizlar.push(`facebook: ${err instanceof Error ? err.message : err}`.slice(0, 200));
            return null;
          }),
        ]);
        if (igId) sosyalPaylasimlar.instagram = igId;
        if (fbId) sosyalPaylasimlar.facebook = fbId;
      } catch (err) {
        basarisizlar.push(
          `instagram+facebook: görsel üretim hatası: ${err instanceof Error ? err.message : err}`.slice(0, 200)
        );
      }
    })(),
  ]);
  if (threadsId) sosyalPaylasimlar.threads = threadsId;

  return { basarisizlar, sosyalPaylasimlar };
}
