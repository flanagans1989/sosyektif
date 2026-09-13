import { postToPublicChannel } from "../lib/telegram.js";
import { postSkeet } from "../lib/bluesky.js";
import { postToThreads } from "../lib/threads.js";
import { postToInstagram, postReelToInstagram } from "../lib/instagram.js";
import { postToFacebook, postVideoToFacebook } from "../lib/facebook.js";
import { FORMAT_ETIKETLERI_TR, FORMAT_EMOJI, KATEGORI_EMOJI } from "../lib/formatLabels.js";
import { generateCarouselSlides, writeCarouselSlides, writeReelVideo } from "../image/social.js";
import { slaytlardanReelUret } from "../image/reelRender.js";
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
 *   Facebook'a carousel yerine ffmpeg ile üretilen kısa dikey video
 *   (Reels/video) gönderilir (bkz. image/reelRender.ts). Varsayılan kapalı.
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
  const kategoriEmoji = KATEGORI_EMOJI[frontmatter.kategori] ?? "🔍";

  const telegramMetni = `${formatEmoji} <b>${etiket}</b>\n\n${frontmatter.baslik}\n\n${frontmatter.metaAciklama}\n\n👉 ${publicUrl}`;
  const blueskyMetni = `${formatEmoji} ${frontmatter.baslik}\n\n${frontmatter.metaAciklama}`;
  const threadsMetni = `${formatEmoji} ${frontmatter.baslik}\n\n${frontmatter.metaAciklama}`;
  const instagramMetni = `${formatEmoji} ${frontmatter.baslik}\n\n${frontmatter.metaAciklama}\n\n👆 Detaylar ve devamı bio'daki linkte\n\n${kategoriEmoji} #sosyektif #${frontmatter.kategori} #${frontmatter.format}`;
  // Facebook, Instagram'dan farklı olarak tıklanabilir link destekliyor.
  const facebookMetni = `${formatEmoji} ${frontmatter.baslik}\n\n${frontmatter.metaAciklama}\n\n👉 ${publicUrl}\n\n${kategoriEmoji} #sosyektif #${frontmatter.kategori} #${frontmatter.format}`;

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
      try {
        const slaytlar = await generateCarouselSlides(frontmatter);

        // Reels açıksa carousel yerine tek bir video üretilip yüklenir —
        // aynı içeriği iki farklı biçimde art arda paylaşmak yerine, Reels'in
        // çok daha yüksek erişim aldığı biçimi tercih ediyoruz.
        const dosyalar: { url: string; dosyaYolu: string }[] = reelsAktif
          ? [await writeReelVideo(slug, await slaytlardanReelUret(slaytlar))]
          : await writeCarouselSlides(slug, slaytlar);

        // Kritik: bu dosyalar normalde pipeline SONUNDA commit'lenir, ama
        // Instagram'ın çekeceği URL'in paylaşım anında zaten canlı olması
        // gerekiyor — yoksa görselsiz/kırık paylaşım gider (bkz. gitYayinla.ts
        // başlık yorumu, 2026-09-13'te gerçek paylaşımda tespit edildi).
        const pushEdildi = dosyalariHemenYayinla(
          dosyalar.map((d) => d.dosyaYolu),
          `Sosyal medya ${reelsAktif ? "reel'i" : "görselleri"}: ${slug}`
        );
        if (!pushEdildi) {
          basarisizlar.push("instagram+facebook: görsel/video push edilemedi");
          return;
        }
        const urls = dosyalar.map((d) => d.url);
        const canli = await canliyaCikanaKadarBekle(urls);
        if (!canli) {
          basarisizlar.push("instagram+facebook: görsel/video zaman aşımına uğradı (Cloudflare Pages build gecikti?)");
          return;
        }

        const [igId, fbId] = await Promise.all([
          (reelsAktif
            ? postReelToInstagram(instagramMetni, urls[0]!)
            : postToInstagram(instagramMetni, urls)
          ).catch((err) => {
            basarisizlar.push(`instagram: ${err instanceof Error ? err.message : err}`.slice(0, 200));
            return null;
          }),
          (reelsAktif
            ? postVideoToFacebook(facebookMetni, urls[0]!)
            : postToFacebook(facebookMetni, urls)
          ).catch((err) => {
            basarisizlar.push(`facebook: ${err instanceof Error ? err.message : err}`.slice(0, 200));
            return null;
          }),
        ]);
        if (igId) sosyalPaylasimlar.instagram = igId;
        if (fbId) sosyalPaylasimlar.facebook = fbId;
      } catch (err) {
        basarisizlar.push(
          `instagram+facebook: görsel/video üretim hatası: ${err instanceof Error ? err.message : err}`.slice(0, 200)
        );
      }
    })(),
  ]);
  if (threadsId) sosyalPaylasimlar.threads = threadsId;

  return { basarisizlar, sosyalPaylasimlar };
}
