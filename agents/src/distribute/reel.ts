/**
 * Reels onay akışı (PLAN.md Bölüm 11.9). Kullanıcı: "genelde dışarıda
 * oluyorum, Telegram'dan izleyip onay versem".
 *
 *   1. reeliOnayaGonder: video üretilir, admin Telegram'ına "✅ Reels olarak
 *      paylaş / ❌ Paylaşma" butonlarıyla gönderilir. Hiçbir yere paylaşılmaz.
 *   2. ✅'e basılınca worker (worker/telegram-onay, reel_ok) GitHub'da
 *      reel-paylas.yml'i başlatır → reeliPaylas: video siteye yüklenir,
 *      canlıya çıkınca Instagram Reels + Facebook video olarak paylaşılır.
 *
 * Video iki adımda ayrı ayrı üretiliyor (onaya gönderirken ve paylaşırken):
 * render deterministik olduğu için onaylanan video ile paylaşılan birebir
 * aynı, ve onay saatler sonra gelebildiği için ara dosya saklamaya gerek
 * kalmıyor.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { muzikEkle, muzikKutuphanesi, muzikSec, reelUret } from "../image/reelRender.js";
import { REEL_GENISLIK, REEL_YUKSEKLIK } from "../image/reelSablon.js";
import { writeReelVideo } from "../image/social.js";
import { canliyaCikanaKadarBekle, dosyalariHemenYayinla } from "../lib/gitYayinla.js";
import { postReelToInstagram } from "../lib/instagram.js";
import { postVideoToFacebook } from "../lib/facebook.js";
import { escapeHtml, notifyAdmin, sendVideoToAdmin } from "../lib/telegram.js";
import { postShortToYouTube } from "../lib/youtube.js";
import { DAGITIM_DOSYASI, bosKayit, readDagitimDurumu, writeDagitimDurumu } from "../lib/dagitimDurumu.js";
import { POSTS_DIR } from "../lib/paths.js";
import { FORMAT_EMOJI, KATEGORI_EMOJI } from "../lib/formatLabels.js";
import type { Post } from "../lib/schemas.js";

export function sosyalMetinler(frontmatter: Post, publicUrl: string): { instagram: string; facebook: string } {
  const formatEmoji = FORMAT_EMOJI[frontmatter.format];
  const kategoriEmoji = KATEGORI_EMOJI[frontmatter.kategori] ?? "🔍";
  const etiketler = `${kategoriEmoji} #sosyektif #${frontmatter.kategori} #${frontmatter.format}`;
  return {
    instagram: `${formatEmoji} ${frontmatter.baslik}\n\n${frontmatter.metaAciklama}\n\n👆 Detaylar ve devamı bio'daki linkte\n\n${etiketler}`,
    // Facebook, Instagram'dan farklı olarak tıklanabilir link destekliyor.
    facebook: `${formatEmoji} ${frontmatter.baslik}\n\n${frontmatter.metaAciklama}\n\n👉 ${publicUrl}\n\n${etiketler}`,
  };
}

export async function icerigiOku(slug: string): Promise<Post> {
  const md = await readFile(path.join(POSTS_DIR, `${slug}.md`), "utf8");
  return yaml.load(md.split(/^---$/m)[1] ?? "") as Post;
}

/** Reels'i üretip onay butonlarıyla admin Telegram'ına gönderir — paylaşım yapmaz. */
export async function reeliOnayaGonder(frontmatter: Post, slug: string): Promise<void> {
  const muzik = await muzikSec(slug);
  const { video, sureMs } = await reelUret(frontmatter, muzik?.dosya ?? null);
  await sendVideoToAdmin(
    video,
    `🎬 <b>Reels onayı</b>\n${escapeHtml(frontmatter.baslik)}\n${muzik ? `🎵 ${escapeHtml(muzik.ruhHali)}\n` : ""}\n✅ basarsan Instagram Reels + Facebook + YouTube Shorts'ta paylaşılır (~5 dk).`,
    { onaySlug: slug, genislik: REEL_GENISLIK, yukseklik: REEL_YUKSEKLIK, sureSn: sureMs / 1000 }
  );
}

/**
 * Müzik seçimi için: aynı videoyu kütüphanedeki her parçayla ayrı ayrı
 * admin Telegram'ına gönderir (butonsuz). Sesi kullanıcı değerlendiriyor —
 * video bir kez render edilir, müzik ekleme saniyeler sürer.
 */
export async function muzikKarsilastirmasiGonder(frontmatter: Post): Promise<void> {
  const liste = await muzikKutuphanesi();
  const { video: sessiz, sureMs } = await reelUret(frontmatter);
  for (const [i, parca] of liste.entries()) {
    const video = await muzikEkle(sessiz, sureMs, parca.dosya);
    await sendVideoToAdmin(
      video,
      `🎵 <b>Müzik ${i + 1}/${liste.length}</b> — ${escapeHtml(parca.ruhHali)}\n<i>${escapeHtml(parca.ad)}</i>`,
      { genislik: REEL_GENISLIK, yukseklik: REEL_YUKSEKLIK, sureSn: sureMs / 1000 }
    );
  }
  await notifyAdmin(
    `🎧 ${liste.length} müzik seçeneği gönderildi. Beğendiklerinin numarasını yaz (ör. "1 ve 3") — o parçalar kullanılacak, beğenmediklerin çıkarılacak.`
  );
}

/** Onaylanan Reels'i siteye yükleyip Instagram + Facebook'ta paylaşır (reel-paylas.yml). */
export async function reeliPaylas(slug: string): Promise<void> {
  const frontmatter = await icerigiOku(slug);
  const publicUrl = `https://sosyektif.com/${slug}/`;
  const metinler = sosyalMetinler(frontmatter, publicUrl);

  const muzik = await muzikSec(slug);
  const { video } = await reelUret(frontmatter, muzik?.dosya ?? null);
  const dosya = await writeReelVideo(slug, video);
  if (!dosyalariHemenYayinla([dosya.dosyaYolu], `Reels videosu: ${slug}`)) {
    throw new Error("video push edilemedi");
  }
  if (!(await canliyaCikanaKadarBekle([dosya.url]))) {
    throw new Error("video zaman aşımında canlıya çıkmadı (Cloudflare Pages build gecikti?)");
  }

  const hatalar: string[] = [];
  const hataYaz = (kanal: string) => (err: unknown) => {
    hatalar.push(`${kanal}: ${err instanceof Error ? err.message : err}`.slice(0, 200));
    return null;
  };
  const [igId, fbId, yt] = await Promise.all([
    postReelToInstagram(metinler.instagram, dosya.url).catch(hataYaz("instagram")),
    postVideoToFacebook(metinler.facebook, dosya.url).catch(hataYaz("facebook")),
    postShortToYouTube({
      baslik: frontmatter.baslik,
      aciklama: `${frontmatter.metaAciklama}\n\n👉 Devamı: ${publicUrl}\n\n#sosyektif #${frontmatter.kategori}`,
      etiketler: ["sosyektif", frontmatter.kategori, frontmatter.format, ...(frontmatter.etiketler ?? [])],
      video,
    }).catch(hataYaz("youtube")),
  ]);

  // Paylaşım kimliklerini dağıtım kaydına yaz (sosyal performans ve sağlık denetimi okur).
  const durum = await readDagitimDurumu();
  const kayit = (durum[slug] ??= bosKayit());
  const simdi = new Date().toISOString();
  kayit.kanallar.reel = { durum: igId || fbId || yt ? "ok" : "hata", deneme: 1, sonDeneme: simdi };
  if (igId) kayit.reelIdleri.instagram = igId;
  if (fbId) kayit.reelIdleri.facebook = fbId;
  if (yt) kayit.kanallar.youtube = { durum: "ok", deneme: 1, id: yt.id, sonDeneme: simdi };
  await writeDagitimDurumu(durum);
  dosyalariHemenYayinla([DAGITIM_DOSYASI], `Reels paylaşım durumu: ${slug}`);

  // YouTube denetimden geçmemiş projelerde videoyu "özel" kilitler — bunu gizleme.
  const ytNotu = yt && yt.gizlilik !== "public" ? ` (YouTube videoyu "${yt.gizlilik}" olarak tuttu — API denetimi onaylanana kadar herkese açık olmaz)` : "";
  const paylasilan = [igId ? "Instagram Reels" : null, fbId ? "Facebook" : null, yt ? `YouTube Shorts${ytNotu}` : null].filter(Boolean).join(" + ");
  await notifyAdmin(
    (paylasilan ? `🎬 Reels paylaşıldı (${paylasilan}): <b>${escapeHtml(frontmatter.baslik)}</b>` : `⚠️ Reels paylaşılamadı: <b>${escapeHtml(frontmatter.baslik)}</b>`) +
      (hatalar.length ? `\n\n${escapeHtml(hatalar.join("\n"))}` : "")
  );
  if (!paylasilan) throw new Error(hatalar.join("; ") || "hiçbir platforma paylaşılamadı");
}
