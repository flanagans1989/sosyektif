/**
 * Dağıtım kuyruğu (PLAN.md Bölüm 3.6 / 11.2).
 *
 * Kullanıcı: "Her içeriği paylaşmaya başlayalım." Önceden dağıtım yalnızca
 * OTOMATİK yayınlanan içerikte, üretimle aynı anda ve tek sefer deneniyordu:
 *   - Telegram'dan elle onaylanan içerikler (yayınların çoğu) hiç paylaşılmıyordu,
 *   - bir kanal o an hata verirse o içerik o kanalda bir daha denenmiyordu,
 *   - hatalar yalnızca CI konsolunda kalıyordu.
 *
 * Artık dağıtım DURUMA dayalı: data/dagitim.json her canlı içerik için her
 * kanalın durumunu tutar. `dagitimKuyrugunuIsle` (npm run dagit,
 * .github/workflows/dagitim.yml) canlıdaki içerikleri tarar, eksik/başarısız
 * kanalları dener, sonucu her kanaldan hemen sonra kaydedip push'lar (iş
 * yarıda kesilse bile aynı gönderi iki kez atılmaz).
 *
 * Tetikleyiciler: pipeline bitince, Telegram onayı gelince (Worker), saatlik
 * zamanlayıcı. Aynı anda iki kez çalışmaz (workflow concurrency).
 */
import { readFile, readdir, access } from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { POSTS_DIR, SITE_DIR } from "../lib/paths.js";
import {
  DAGITIM_DOSYASI,
  bosKayit,
  readDagitimDurumu,
  writeDagitimDurumu,
  type DagitimDurumu,
  type Kanal,
  type KanalDurumu,
} from "../lib/dagitimDurumu.js";
import { optionalEnv } from "../lib/env.js";
import { readConfig, readPublishedIndex } from "../lib/state.js";
import { postToPublicChannel, notifyAdmin, escapeHtml } from "../lib/telegram.js";
import { postSkeet } from "../lib/bluesky.js";
import { postToThreads } from "../lib/threads.js";
import { postToInstagram } from "../lib/instagram.js";
import { postToFacebook } from "../lib/facebook.js";
import { getMetaToken } from "../lib/metaToken.js";
import { FORMAT_ETIKETLERI_TR, FORMAT_EMOJI } from "../lib/formatLabels.js";
import { generateCarouselSlides, writeCarouselSlides } from "../image/social.js";
import { reeliOnayaGonder, sosyalMetinler } from "./reel.js";
import { canliyaCikanaKadarBekle, dosyalariHemenYayinla, uzakDurumuCek } from "../lib/gitYayinla.js";
import type { Post } from "../lib/schemas.js";

/** Kuyruğun kendisinin paylaştığı kanallar. YouTube Shorts ve Instagram
 * Reels/Facebook videosu, Telegram'daki video onayından (✅) sonra
 * reel-paylas.yml'de paylaşılır; kuyruk videoyu yalnızca onaya gönderir
 * (kanallar.reel: onayda → reel-paylas sonrası ok). */
const OTOMATIK_KANALLAR = ["telegram", "bluesky", "threads", "instagram", "facebook"] as const satisfies readonly Kanal[];
type OtomatikKanal = (typeof OTOMATIK_KANALLAR)[number];

const SOCIAL_DIR = path.join(SITE_DIR, "public", "images", "social");

/** Bir kanalda üst üste bu kadar başarısız olunca vazgeçilir (bildirim gider). */
const MAKS_DENEME = 4;
/** Tek çalışmada en fazla kaç içerik işlenir — eski içerikler (geçmiş birikim)
 * hesaplara tek seferde yığılmasın, saatlere yayılsın. Son 24 saatin
 * içerikleri bu sınıra takılmaz. */
const GECMIS_ICERIK_SINIRI = 1;
/** Kanal başına tek çalışmada en fazla kaç içerik. Instagram carousel'i içerik başına
 * onlarca Graph API çağrısı yapar (8-10 alt öğe + carousel + yayın + durum yoklaması);
 * uygulama başına saatlik çağrı sınırı ("Application request limit reached") aşılınca
 * kalan paylaşımlar da düşer. Birikim saatlere yayılır. */
const TUR_SINIRI: Partial<Record<string, number>> = { instagram: 2, facebook: 3 };
/** Kanalın API'si "çağrı sınırı doldu" dediyse bu, içeriğin hatası değil bekleme sebebidir. */
const HIZ_SINIRI_HATASI = /request limit reached|too many (calls|requests)|rate.?limit|"code":s*(4|17|32|613)/i;
/** Meta "action is blocked" (alt kod 2207051): geçici kota değil, hesaba konmuş spam/otomasyon
 * kısıtı. Saatlik denemek (her seferinde onlarca container açmak) kısıtı uzatır → uzun bekle. */
const ENGEL_HATASI = /2207051|action is blocked/i;
const ENGEL_BEKLEME_SAAT = 6;
const TAZE_ICERIK_SAAT = 24;
const SAAT_MS = 60 * 60 * 1000;

/** Durumu kaydedip hemen push'lar — iş yarıda kesilirse çift paylaşım olmasın.
 * Push başarısız olursa false döner: durum yalnızca runner'da kalır ve çalışma
 * bitince kaybolur (sonraki çalışma aynı içeriği yeniden paylaşırdı). */
async function kaydetVeYayinla(durum: DagitimDurumu, mesaj: string): Promise<boolean> {
  await writeDagitimDurumu(durum);
  const yerelCalisma = !process.env.GITHUB_ACTIONS; // yerelde push yapılmaz; başarısızlık sayılmaz
  return dosyalariHemenYayinla([DAGITIM_DOSYASI], mesaj) || yerelCalisma;
}

interface CanliIcerik {
  slug: string;
  frontmatter: Post;
  yayinTarihi: Date;
}

async function canliIcerikleriOku(): Promise<CanliIcerik[]> {
  const dosyalar = (await readdir(POSTS_DIR)).filter((d) => d.endsWith(".md"));
  const sonuc: CanliIcerik[] = [];
  for (const dosya of dosyalar) {
    const md = await readFile(path.join(POSTS_DIR, dosya), "utf8");
    const fm = yaml.load(md.split(/^---$/m)[1] ?? "") as Post | undefined;
    if (!fm || fm.taslak) continue;
    sonuc.push({ slug: dosya.replace(/\.md$/, ""), frontmatter: fm, yayinTarihi: new Date(fm.yayinTarihi) });
  }
  // En yeni önce: taze içerik gündemdeyken paylaşılsın, birikim arkadan gelsin.
  return sonuc.sort((a, b) => b.yayinTarihi.getTime() - a.yayinTarihi.getTime());
}

/** Bu çalışmada hangi kanallar kullanılabilir? (Kimlik bilgisi yoksa kanal
 * "bekliyor"da kalır ama deneme hakkı yakılmaz — yapılandırılınca paylaşılır.) */
async function kullanilabilirKanallar(kapali: string[]): Promise<Set<OtomatikKanal>> {
  const set = new Set<OtomatikKanal>();
  if (optionalEnv("TELEGRAM_BOT_TOKEN") && optionalEnv("TELEGRAM_PUBLIC_CHANNEL_ID")) set.add("telegram");
  if (optionalEnv("BLUESKY_HANDLE") && optionalEnv("BLUESKY_APP_PASSWORD")) set.add("bluesky");
  const [threads, ig, fb] = await Promise.all([getMetaToken("threads"), getMetaToken("instagram"), getMetaToken("facebook")]);
  if (threads) set.add("threads");
  if (ig?.ig_user_id) set.add("instagram");
  if (fb?.page_id) set.add("facebook");
  for (const k of kapali) set.delete(k as OtomatikKanal); // config.kapaliKanallar: elle kapatılmış
  return set;
}

function denenmeli(k: KanalDurumu | undefined): boolean {
  if (!k) return true;
  if (k.durum === "bekliyor") return true;
  if (k.durum !== "hata") return false;
  // Artan bekleme: 1., 2., 3. denemeden sonra 1, 2, 3 saat.
  const son = k.sonDeneme ? new Date(k.sonDeneme).getTime() : 0;
  // deneme 0 olabilir (hız sınırı hatası deneme hakkı yemez): en az 1 saat bekle.
  const beklemeSaat = ENGEL_HATASI.test(k.hata ?? "") ? ENGEL_BEKLEME_SAAT : Math.max(1, k.deneme);
  return Date.now() - son >= beklemeSaat * SAAT_MS;
}

/** Telegram ve kısa metin (Bluesky/Threads); Instagram/Facebook metinleri reel.ts'teki sosyalMetinler'den. */
function metinler(fm: Post, url: string) {
  const emoji = FORMAT_EMOJI[fm.format];
  const etiket = FORMAT_ETIKETLERI_TR[fm.format];
  return {
    telegram: `${emoji} <b>${etiket}</b>\n\n${escapeHtml(fm.baslik)}\n\n${escapeHtml(fm.metaAciklama)}\n\n👉 ${url}`,
    kisa: `${emoji} ${fm.baslik}\n\n${fm.metaAciklama}`,
  };
}

async function dosyaVarMi(yol: string): Promise<boolean> {
  return access(yol).then(
    () => true,
    () => false
  );
}

/** Carousel görsellerini hazırlar: repoda zaten varsa yeniden üretmez; yoksa
 * üretip push'lar. Instagram görseli URL'den çektiği için canlıya çıkmasını bekler. */
async function carouselHazirla(icerik: CanliIcerik): Promise<string[]> {
  const mevcut: string[] = [];
  for (let i = 1; i <= 10; i++) {
    if (await dosyaVarMi(path.join(SOCIAL_DIR, `${icerik.slug}-${i}.jpg`))) {
      mevcut.push(`https://sosyektif.com/images/social/${icerik.slug}-${i}.jpg`);
    } else break;
  }
  let urls = mevcut;
  if (urls.length === 0) {
    const dosyalar = await writeCarouselSlides(icerik.slug, await generateCarouselSlides(icerik.frontmatter));
    if (!dosyalariHemenYayinla(dosyalar.map((d) => d.dosyaYolu), `Sosyal medya görselleri: ${icerik.slug} (${dosyalar.length} slayt)`)) {
      throw new Error("carousel görselleri push edilemedi");
    }
    urls = dosyalar.map((d) => d.url);
  }
  if (!(await canliyaCikanaKadarBekle(urls, { timeoutMs: 300_000 }))) {
    throw new Error("carousel görselleri 5 dakikada canlıya çıkmadı (Cloudflare Pages build gecikti?)");
  }
  return urls;
}

export interface KuyrukRaporu {
  paylasilan: string[];
  hatalar: string[];
  vazgecilen: string[];
  kalanIcerik: number;
}

export async function dagitimKuyrugunuIsle(): Promise<KuyrukRaporu> {
  const rapor: KuyrukRaporu = { paylasilan: [], hatalar: [], vazgecilen: [], kalanIcerik: 0 };
  const config = await readConfig();
  if (config.paused) {
    console.log("[dagitim] pipeline duraklatılmış, dağıtım da bekliyor");
    return rapor;
  }

  const durum = await readDagitimDurumu();
  const icerikler = await canliIcerikleriOku();
  const kanallar = await kullanilabilirKanallar(config.kapaliKanallar);
  console.log(`[dagitim] ${icerikler.length} canlı içerik, kullanılabilir kanallar: ${[...kanallar].join(", ") || "yok"}`);

  // İlk çalışmada: sosyal kimliği zaten published-index'te olan (eski
  // dağıtımla paylaşılmış) kanalları "ok" say — tekrar paylaşılmasın.
  const index = await readPublishedIndex().catch(() => []);
  for (const e of index) {
    if (!e.sosyalPaylasimlar || durum[e.slug]) continue;
    durum[e.slug] = bosKayit();
    for (const [kanal, id] of Object.entries(e.sosyalPaylasimlar)) {
      if (id) durum[e.slug]!.kanallar[kanal] = { durum: "ok", deneme: 1, id };
    }
  }

  // Reels onayı yalnızca taze içerik için (eski birikim için onlarca video onayı yağmasın).
  const tazeMi = (ic: CanliIcerik) => Date.now() - ic.yayinTarihi.getTime() < TAZE_ICERIK_SAAT * SAAT_MS;
  const reelGerekli = (ic: CanliIcerik) => config.reelsAktif && tazeMi(ic) && denenmeli(durum[ic.slug]?.kanallar.reel);
  const islenecekler = icerikler.filter(
    (ic) => [...kanallar].some((k) => denenmeli(durum[ic.slug]?.kanallar[k])) || reelGerekli(ic)
  );
  const taze = islenecekler.filter(tazeMi);
  const gecmis = islenecekler.filter((ic) => !taze.includes(ic)).slice(0, GECMIS_ICERIK_SINIRI);
  const buTur = [...taze, ...gecmis];
  rapor.kalanIcerik = islenecekler.length - buTur.length;

  let durumKaydedilemedi = false;
  const hizSinirliKanallar = new Set<string>();
  const turSayaci: Record<string, number> = {};
  for (const icerik of buTur) {
    const url =`https://sosyektif.com/${icerik.slug}/`;
    // Link canlı değilse (Cloudflare build sürüyor) paylaşma — kırık link gider.
    if (!(await canliyaCikanaKadarBekle([url], { timeoutMs: 300_000 }))) {
      console.warn(`[dagitim] ${icerik.slug} henüz canlı değil, sonraki tura kaldı`);
      rapor.kalanIcerik++;
      continue;
    }
    let kayit = (durum[icerik.slug] ??= bosKayit());
    const m ={ ...metinler(icerik.frontmatter, url), ...sosyalMetinler(icerik.frontmatter, url) };

    let carousel: Promise<string[]> | null = null;
    const gorseller = () => (carousel ??= carouselHazirla(icerik));

    const paylas: Record<OtomatikKanal, () => Promise<string | null | void>> = {
      telegram: () => postToPublicChannel(m.telegram),
      bluesky: () => postSkeet(m.kisa, url, { baslik: icerik.frontmatter.baslik, aciklama: icerik.frontmatter.metaAciklama }),
      threads: () => postToThreads(m.kisa, url),
      instagram: async () => postToInstagram(m.instagram, await gorseller()),
      facebook: async () => postToFacebook(m.facebook, await gorseller()),
    };

    const adimlar: { ad: string; calistir: () => Promise<string | null | void>; basariDurumu: "ok" | "onayda" }[] = [
      ...OTOMATIK_KANALLAR.filter((k) => kanallar.has(k) && denenmeli(kayit.kanallar[k])).map((k) => ({
        ad: k as string,
        calistir: paylas[k],
        basariDurumu: "ok" as const,
      })),
      ...(reelGerekli(icerik)
        ? [{ ad: "reel", calistir: () => reeliOnayaGonder(icerik.frontmatter, icerik.slug), basariDurumu: "onayda" as const }]
        : []),
    ];

    for (const { ad: kanal, calistir, basariDurumu } of adimlar) {
      // Bu çalışmada kanal hız sınırına çarptıysa ya da tur kotası dolduysa dokunma (deneme hakkı yakılmaz).
      if (hizSinirliKanallar.has(kanal)) continue;
      if ((turSayaci[kanal] ?? 0) >= (TUR_SINIRI[kanal] ?? Infinity)) {
        rapor.kalanIcerik++;
        continue;
      }
      // Durum çalışmanın başında bir kez okunuyor; bu sırada başka bir çalışma (pipeline/onay/saatlik
      // tetikleyiciler üst üste binebiliyor) aynı kanala paylaşmış olabilir. Paylaşmadan hemen önce
      // uzaktaki güncel durumu çek; kanal artık denenmemeli ise dokunma (çift paylaşım, 2026-09-18).
      if (uzakDurumuCek()) {
        Object.assign(durum, await readDagitimDurumu());
        kayit = (durum[icerik.slug] ??= bosKayit());
      }
      if (!denenmeli(kayit.kanallar[kanal])) {
        console.log(`[dagitim] ↷ ${kanal} ← ${icerik.slug}: başka bir çalışma paylaşmış, atlandı`);
        continue;
      }
      turSayaci[kanal] = (turSayaci[kanal] ?? 0) + 1;
      const onceki = kayit.kanallar[kanal];
      const deneme = (onceki?.durum === "hata" ? onceki.deneme : 0) + 1;
      try {
        const id = await calistir();
        // null = adaptör paylaşmadan döndü (token/görsel yok) — başarı sayma.
        if (id === null) throw new Error("paylaşım atlandı (token/hesap bilgisi ya da görsel yok)");
        kayit.kanallar[kanal] = { durum: basariDurumu, deneme, sonDeneme: new Date().toISOString(), ...(id ? { id } : {}) };
        rapor.paylasilan.push(`${kanal === "reel" ? "Reels onaya gönderildi" : kanal}: ${icerik.frontmatter.baslik}`);
        console.log(`[dagitim] ✓ ${kanal} ← ${icerik.slug}`);
      } catch (err) {
        const mesaj = (err instanceof Error ? err.message : String(err)).slice(0, 300);
        if (HIZ_SINIRI_HATASI.test(mesaj)) {
          // Geçici kota: deneme hakkı düşülmez, kanal bu çalışmada bırakılır, ≥1 saat sonra yeniden denenir.
          hizSinirliKanallar.add(kanal);
          kayit.kanallar[kanal] = { durum: "hata", deneme: deneme - 1, sonDeneme: new Date().toISOString(), hata: mesaj };
          rapor.hatalar.push(
            ENGEL_HATASI.test(mesaj)
              ? `${kanal} (${icerik.slug}): Meta hesabı kısıtladı ("action is blocked"), ${ENGEL_BEKLEME_SAAT} saat sonra yeniden denenecek — Instagram uygulamasında hesap durumunu kontrol et`
              : `${kanal} (${icerik.slug}): API çağrı sınırı doldu, ≥1 saat sonra yeniden denenecek`
          );
          console.warn(`[dagitim] ⏸ ${kanal} hız sınırına çarptı, bu çalışmada bırakıldı: ${mesaj}`);
        } else {
          const vazgec = deneme >= MAKS_DENEME;
          kayit.kanallar[kanal] = { durum: vazgec ? "vazgecildi" : "hata", deneme, sonDeneme: new Date().toISOString(), hata: mesaj };
          (vazgec ? rapor.vazgecilen : rapor.hatalar).push(`${kanal} (${icerik.slug}, deneme ${deneme}): ${mesaj}`);
          console.error(`[dagitim] ✗ ${kanal} ← ${icerik.slug}: ${mesaj}`);
        }
      }
      if (!(await kaydetVeYayinla(durum, `Dağıtım durumu: ${icerik.slug} → ${kanal}`))) {
        // Durum push edilemiyor: daha fazla paylaşırsak hepsi bir sonraki çalışmada
        // tekrarlanır. Dur; aşağıdaki son kayıt bir kez daha dener.
        durumKaydedilemedi = true;
        break;
      }
    }
    if (durumKaydedilemedi) break;
  }

  // Hiç kullanılabilir kanal yoksa bile yeni eklenen kayıtları (eski ID'ler) sakla.
  if (!(await kaydetVeYayinla(durum, "Dağıtım durumu güncellendi"))) {
    await notifyAdmin(
      "🚨 <b>Dağıtım durumu git'e yazılamadı</b>\nSon paylaşımların kaydı kaybolabilir; sonraki çalışma aynı içerikleri tekrar paylaşabilir. dagitim.yml logunu kontrol edin."
    );
    throw new Error("dağıtım durumu push edilemedi");
  }

  if (rapor.paylasilan.length || rapor.hatalar.length || rapor.vazgecilen.length) {
    const satirlar = ["📣 <b>Dağıtım</b>"];
    if (rapor.paylasilan.length) satirlar.push(`✅ ${rapor.paylasilan.length} paylaşım:\n${escapeHtml(rapor.paylasilan.join("\n"))}`);
    if (rapor.hatalar.length) satirlar.push(`⚠️ Tekrar denenecek:\n${escapeHtml(rapor.hatalar.join("\n"))}`);
    if (rapor.vazgecilen.length) satirlar.push(`🛑 ${MAKS_DENEME} denemede de olmadı (kanal düzelince sağlık denetimi yeniden kuyruğa alır):\n${escapeHtml(rapor.vazgecilen.join("\n"))}`);
    if (rapor.kalanIcerik) satirlar.push(`⏳ Kuyrukta ${rapor.kalanIcerik} içerik daha var (saatte bir eskisi paylaşılıyor).`);
    await notifyAdmin(satirlar.join("\n\n").slice(0, 4000));
  }
  return rapor;
}
