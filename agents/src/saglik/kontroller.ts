/**
 * Sağlık denetimi kontrolleri (PLAN.md Bölüm 11.8 — Gözetim ajanı).
 *
 * Kullanıcı: "Bak ben sormasam bilmiyorduk." 2026-09-13'te Bluesky'de hiç
 * gönderi olmadığı, Instagram/Facebook paylaşımlarının her seferinde git
 * çakışmasıyla iptal olduğu ancak elle bakınca fark edildi — hatalar sadece
 * CI konsolunda ya da tek seferlik bir Telegram mesajında kalıyordu.
 *
 * Her kontrol dışarıdan GERÇEK durumu ölçer (hesaptaki gönderi sayısı,
 * token'ın gerçekten çalışması, sitenin 200 dönmesi) — "kod hata fırlatmadı"
 * varsayımına güvenmez. Onarılabilen arızalar için `onar` tanımlıdır;
 * onarılamayanlar ne yapılması gerektiğiyle birlikte raporlanır.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { AtpAgent } from "@atproto/api";
import { optionalEnv } from "../lib/env.js";
import { getMetaToken } from "../lib/metaToken.js";
import { POSTS_DIR, SITE_DIR } from "../lib/paths.js";
import {
  readBlocklist,
  readCategoryWeights,
  readConfig,
  readEvergreen,
  readOzelGunler,
  readPublishedIndex,
  readRunSummary,
} from "../lib/state.js";
import { searchConsoleErisimiDene } from "../analytics/searchConsole.js";
import { readDagitimDurumu, writeDagitimDurumu, KANALLAR, type Kanal } from "../lib/dagitimDurumu.js";
import { youtubeYapilandirildiMi, youtubeKanalBilgisi } from "../lib/youtube.js";

export type Durum = "ok" | "uyari" | "hata";

export interface KontrolSonucu {
  /** Kısa, kalıcı kimlik — aynı sorunun tekrar tekrar bildirilmemesi için. */
  id: string;
  alan: string;
  durum: Durum;
  detay: string;
  /** Kullanıcının yapması gereken (otomatik onarılamıyorsa). */
  cozum?: string;
  /** Otomatik onarım denendiyse sonucu. */
  onarim?: string;
}

const SITE = "https://sosyektif.com";
const WORKER_URL = "https://sosyektif-telegram-onay.deraks-rental.workers.dev";
const SAAT_MS = 60 * 60 * 1000;
/** worker/telegram-onay/src/index.ts'teki WORKER_SURUMU ile aynı tutulur (Worker kodu değişince ikisini de artır). */
const BEKLENEN_WORKER_SURUMU = 2;

function ok(id: string, alan: string, detay: string): KontrolSonucu {
  return { id, alan, durum: "ok", detay };
}
function uyari(id: string, alan: string, detay: string, cozum?: string): KontrolSonucu {
  return { id, alan, durum: "uyari", detay, cozum };
}
function hata(id: string, alan: string, detay: string, cozum?: string): KontrolSonucu {
  return { id, alan, durum: "hata", detay, cozum };
}

async function getJson<T>(url: string, init?: RequestInit): Promise<{ status: number; body: T | null; metin: string }> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
  const metin = await res.text();
  let body: T | null = null;
  try {
    body = JSON.parse(metin) as T;
  } catch {
    // JSON değil
  }
  return { status: res.status, body, metin: metin.slice(0, 300) };
}

const hataMetni = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 300);

// ---------------------------------------------------------------------------
// Site ve altyapı
// ---------------------------------------------------------------------------

export async function siteKontrolleri(): Promise<KontrolSonucu[]> {
  const index = await readPublishedIndex().catch(() => []);
  const canliSluglar = await canliIcerikler();
  const sonIcerik = [...index].reverse().find((e) => canliSluglar.has(e.slug));
  const adresler: [string, string][] = [
    ["site-ana", `${SITE}/`],
    ["site-sitemap", `${SITE}/sitemap-index.xml`],
    ["site-ekodektif", `${SITE}/ekodektif/`],
    ["site-rss", `${SITE}/rss.xml`],
    ...(sonIcerik ? ([["site-son-icerik", `${SITE}/${sonIcerik.slug}/`]] as [string, string][]) : []),
  ];
  return Promise.all(
    adresler.map(async ([id, url]) => {
      try {
        const res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(20_000) });
        return res.ok
          ? ok(id, "Site", `${url} → ${res.status}`)
          : hata(id, "Site", `${url} → ${res.status}`, "Cloudflare Pages son build'ini kontrol et.");
      } catch (err) {
        return hata(id, "Site", `${url} erişilemedi: ${hataMetni(err)}`, "Site/DNS erişimini kontrol et.");
      }
    })
  );
}

/** Canlıdaki (taslak olmayan) içeriklerin slug'ları — dosya sisteminden. */
export async function canliIcerikler(): Promise<Set<string>> {
  const dosyalar = await readdir(POSTS_DIR).catch(() => [] as string[]);
  const canli = new Set<string>();
  for (const dosya of dosyalar.filter((d) => d.endsWith(".md"))) {
    const md = await readFile(path.join(POSTS_DIR, dosya), "utf8");
    const fm = yaml.load(md.split(/^---$/m)[1] ?? "") as { taslak?: boolean } | undefined;
    if (!fm?.taslak) canli.add(dosya.replace(/\.md$/, ""));
  }
  return canli;
}

export async function veriKontrolleri(): Promise<KontrolSonucu[]> {
  const okuyucular: [string, () => Promise<unknown>][] = [
    ["config.json", readConfig],
    ["blocklist.json", readBlocklist],
    ["evergreen.json", readEvergreen],
    ["published-index.json", readPublishedIndex],
    ["category-weights.json", readCategoryWeights],
    ["last-run.json", readRunSummary],
    ["ozel-gunler.json", readOzelGunler],
    ["dagitim.json", readDagitimDurumu],
  ];
  const sonuclar: KontrolSonucu[] = [];
  for (const [ad, oku] of okuyucular) {
    try {
      await oku();
      sonuclar.push(ok(`veri-${ad}`, "Veri dosyaları", `${ad} geçerli`));
    } catch (err) {
      sonuclar.push(hata(`veri-${ad}`, "Veri dosyaları", `${ad} okunamadı/şemaya uymuyor: ${hataMetni(err)}`, "Dosyayı düzelt; ajanlar bu dosyayı okuyamazsa çalışmaz."));
    }
  }

  try {
    const config = await readConfig();
    if (config.paused) {
      sonuclar.push(uyari("pipeline-duraklatildi", "İçerik üretimi", `Pipeline duraklatılmış: ${config.pausedReason ?? "sebep yok"}`, "data/config.json → paused: false"));
    }
  } catch {
    // yukarıda raporlandı
  }

  const index = await readPublishedIndex().catch(() => []);
  const son = index.at(-1);
  if (son) {
    const saat = (Date.now() - new Date(son.yayinTarihi).getTime()) / SAAT_MS;
    sonuclar.push(
      saat > 30
        ? uyari("yayin-yok", "İçerik üretimi", `Son ${Math.round(saat)} saattir yeni içerik üretilmedi.`, "Pipeline loglarına ve LLM anahtarlarına bak.")
        : ok("yayin-yok", "İçerik üretimi", `Son içerik ${Math.round(saat)} saat önce.`)
    );
  }

  // Onay bekleyip unutulan taslaklar.
  const dosyalar = await readdir(POSTS_DIR).catch(() => [] as string[]);
  const bekleyen: string[] = [];
  for (const dosya of dosyalar.filter((d) => d.endsWith(".md"))) {
    const md = await readFile(path.join(POSTS_DIR, dosya), "utf8");
    const fm = yaml.load(md.split(/^---$/m)[1] ?? "") as { taslak?: boolean; yayinTarihi?: string | Date } | undefined;
    if (fm?.taslak && fm.yayinTarihi && Date.now() - new Date(fm.yayinTarihi).getTime() > 24 * SAAT_MS) {
      bekleyen.push(dosya.replace(/\.md$/, ""));
    }
  }
  if (bekleyen.length > 0) {
    sonuclar.push(uyari("onay-bekleyen", "İçerik üretimi", `${bekleyen.length} taslak 24 saatten uzun süredir onay bekliyor.`, "Telegram'daki onay mesajlarına bak (✅/❌)."));
  }
  return sonuclar;
}

// ---------------------------------------------------------------------------
// GitHub Actions: zamanlayıcı ve başarısız çalışmalar (+ otomatik yeniden deneme)
// ---------------------------------------------------------------------------

interface WorkflowRun {
  id: number;
  name: string;
  path: string;
  status: string;
  conclusion: string | null;
  created_at: string;
  run_attempt: number;
  html_url: string;
  event: string;
}

/** Yeniden denemesi güvenli olanlar (tekrar çalışınca çift paylaşım yapmayanlar). */
const YENIDEN_DENENEBILIR = new Set([
  "pipeline.yml",
  "dagitim.yml",
  "burc.yml",
  "burc-uyum.yml",
  "daily-report.yml",
  "weekly-analytics.yml",
]);

function ghHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${optionalEnv("GITHUB_TOKEN")}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

export async function githubKontrolleri(onarimYap: boolean): Promise<KontrolSonucu[]> {
  const repo = optionalEnv("GITHUB_REPOSITORY");
  if (!optionalEnv("GITHUB_TOKEN") || !repo) {
    return [uyari("github-erisim", "Zamanlayıcı", "GITHUB_TOKEN yok — workflow kontrolleri atlandı (yerel çalıştırma).")];
  }
  const sonuclar: KontrolSonucu[] = [];
  const kesim = new Date(Date.now() - 24 * SAAT_MS).toISOString();
  const { status, body } = await getJson<{ workflow_runs: WorkflowRun[] }>(
    `https://api.github.com/repos/${repo}/actions/runs?per_page=100&created=>${kesim}`,
    { headers: ghHeaders() }
  );
  if (status !== 200 || !body) {
    return [hata("github-erisim", "Zamanlayıcı", `GitHub Actions API ${status}`)];
  }
  const calismalar = body.workflow_runs;
  const dosyaAdi = (r: WorkflowRun) => r.path.split("/").pop() ?? r.path;

  // Zamanlayıcı canlı mı? pipeline saatte bir tetikleniyor (cron-job.org →
  // Worker /tetikle → dispatch, yedek olarak GitHub schedule).
  const pipelineCalismalari = calismalar.filter((r) => dosyaAdi(r) === "pipeline.yml");
  const sonPipeline = pipelineCalismalari[0];
  const sonPipelineSaat = sonPipeline ? (Date.now() - new Date(sonPipeline.created_at).getTime()) / SAAT_MS : Infinity;
  if (sonPipelineSaat > 2.5) {
    const r = hata(
      "zamanlayici",
      "Zamanlayıcı",
      sonPipeline ? `Pipeline ${sonPipelineSaat.toFixed(1)} saattir hiç tetiklenmedi.` : "Son 24 saatte hiç pipeline çalışması yok.",
      "cron-job.org'daki saatlik /tetikle görevini kontrol et."
    );
    if (onarimYap) {
      const d = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/pipeline.yml/dispatches`, {
        method: "POST",
        headers: { ...ghHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ ref: "main" }),
      });
      r.onarim = d.ok ? "Pipeline elle başlatıldı (zamanlayıcı yine de kontrol edilmeli)." : `Pipeline başlatılamadı: ${d.status}`;
    }
    sonuclar.push(r);
  } else {
    sonuclar.push(ok("zamanlayici", "Zamanlayıcı", `Pipeline son ${sonPipelineSaat.toFixed(1)} saat önce çalıştı.`));
  }

  // Başarısız çalışmalar: her workflow için yalnızca EN SON çalışmaya bak —
  // sonradan başarılı olmuşsa geçmişteki hata artık sorun değil.
  const enSon = new Map<string, WorkflowRun>();
  for (const r of calismalar) {
    if (r.status !== "completed") continue;
    if (!enSon.has(dosyaAdi(r))) enSon.set(dosyaAdi(r), r);
  }
  const basarisizlar = [...enSon.entries()].filter(([, r]) => ["failure", "timed_out", "startup_failure"].includes(r.conclusion ?? ""));
  for (const [dosya, r] of basarisizlar) {
    const k = hata(`workflow-${dosya}`, "Zamanlayıcı", `${r.name} son çalışması başarısız (${r.conclusion}): ${r.html_url}`, "Logu incele.");
    if (onarimYap && YENIDEN_DENENEBILIR.has(dosya) && r.run_attempt < 2) {
      const d = await fetch(`https://api.github.com/repos/${repo}/actions/runs/${r.id}/rerun-failed-jobs`, {
        method: "POST",
        headers: ghHeaders(),
      });
      k.onarim = d.ok ? "Başarısız işler yeniden başlatıldı." : `Yeniden başlatılamadı: ${d.status}`;
    }
    sonuclar.push(k);
  }
  // Günlük site verileri (burç, tarihte bugün) bugünün mü? TR 06:00'dan sonra
  // hâlâ dünkü veri varsa burc.yml çalışmamış demektir — yeniden başlat.
  const trSimdi = new Date(Date.now() + 3 * SAAT_MS);
  const trBugun = trSimdi.toISOString().slice(0, 10);
  if (trSimdi.getUTCHours() >= 6) {
    const bayat: string[] = [];
    for (const dosya of ["gunluk-burc.json", "tarihte-bugun.json"]) {
      try {
        const veri = JSON.parse(await readFile(path.join(SITE_DIR, "src", "data", dosya), "utf-8")) as { tarih?: string };
        if (veri.tarih !== trBugun) bayat.push(`${dosya} (${veri.tarih ?? "tarih yok"})`);
      } catch {
        bayat.push(`${dosya} (okunamadı)`);
      }
    }
    if (bayat.length > 0) {
      const k = hata("gunluk-veri", "Günlük içerik", `Bugünün verisi yok: ${bayat.join(", ")}`, "burc.yml loglarına bak.");
      if (onarimYap) {
        const d = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/burc.yml/dispatches`, {
          method: "POST",
          headers: { ...ghHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ ref: "main" }),
        });
        k.onarim = d.ok ? "Burç + Tarihte Bugün işi yeniden başlatıldı." : `burc.yml başlatılamadı: ${d.status}`;
      }
      sonuclar.push(k);
    } else {
      sonuclar.push(ok("gunluk-veri", "Günlük içerik", "Burç ve Tarihte Bugün bugünün verisiyle güncel"));
    }
  }

  if (basarisizlar.length === 0) {
    sonuclar.push(ok("workflow-hatalari", "Zamanlayıcı", `Son 24 saatte ${enSon.size} workflow'un son çalışması başarılı.`));
  }
  return sonuclar;
}

// ---------------------------------------------------------------------------
// API anahtarları (LLM, görsel, analitik, site verileri)
// ---------------------------------------------------------------------------

export async function anahtarKontrolleri(): Promise<KontrolSonucu[]> {
  const sonuclar: KontrolSonucu[] = [];
  const dene = async (id: string, alan: string, ad: string, env: string | null, istek: (anahtar: string) => Promise<Response>, zorunlu = true) => {
    const anahtar = env ? optionalEnv(env) : "";
    if (env && !anahtar) {
      sonuclar.push(
        zorunlu
          ? hata(id, alan, `${ad}: ${env} tanımlı değil.`, `GitHub Secrets'a ${env} ekle.`)
          : uyari(id, alan, `${ad}: ${env} tanımlı değil (yedek kaynak, zorunlu değil).`)
      );
      return;
    }
    try {
      const res = await istek(anahtar ?? "");
      sonuclar.push(
        res.ok
          ? ok(id, alan, `${ad} çalışıyor`)
          : hata(id, alan, `${ad}: ${res.status} ${(await res.text()).slice(0, 160)}`, env ? `${env} geçersiz/kotası dolmuş olabilir.` : undefined)
      );
    } catch (err) {
      sonuclar.push(hata(id, alan, `${ad}: ${hataMetni(err)}`));
    }
  };
  const t = { signal: AbortSignal.timeout(20_000) };

  await Promise.all([
    dene("llm-gemini", "Yapay zekâ", "Gemini", "GEMINI_API_KEY", (k) => fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${k}`, t)),
    dene("llm-groq", "Yapay zekâ", "Groq", "GROQ_API_KEY", (k) => fetch("https://api.groq.com/openai/v1/models", { ...t, headers: { Authorization: `Bearer ${k}` } })),
    dene("llm-mistral", "Yapay zekâ", "Mistral", "MISTRAL_API_KEY", (k) => fetch("https://api.mistral.ai/v1/models", { ...t, headers: { Authorization: `Bearer ${k}` } })),
    dene("llm-cerebras", "Yapay zekâ", "Cerebras", "CEREBRAS_API_KEY", (k) => fetch("https://api.cerebras.ai/v1/models", { ...t, headers: { Authorization: `Bearer ${k}` } })),
    dene("gorsel-pexels", "Görsel", "Pexels", "PEXELS_API_KEY", (k) => fetch("https://api.pexels.com/v1/search?query=nature&per_page=1", { ...t, headers: { Authorization: k } })),
    dene("gorsel-unsplash", "Görsel", "Unsplash", "UNSPLASH_ACCESS_KEY", (k) => fetch(`https://api.unsplash.com/photos/random?client_id=${k}`, t), false),
    dene("trend-youtube", "Trend kaynakları", "YouTube Data API (trend)", "YOUTUBE_API_KEY", (k) => fetch(`https://www.googleapis.com/youtube/v3/videos?part=id&chart=mostPopular&regionCode=TR&maxResults=1&key=${k}`, t)),
    dene("trend-wikipedia", "Trend kaynakları", "Wikipedia en çok okunanlar", null, () => {
      const dun = new Date(Date.now() - 2 * 24 * SAAT_MS);
      const [y, a, g] = [dun.getUTCFullYear(), String(dun.getUTCMonth() + 1).padStart(2, "0"), String(dun.getUTCDate()).padStart(2, "0")];
      return fetch(`https://wikimedia.org/api/rest_v1/metrics/pageviews/top/tr.wikipedia/all-access/${y}/${a}/${g}`, { ...t, headers: { "User-Agent": "sosyektif-saglik/1.0" } });
    }),
    dene("trend-google", "Trend kaynakları", "Google Trends RSS", null, () => fetch("https://trends.google.com/trending/rss?geo=TR", t)),
    dene("site-veri-truncgil", "Ekodektif verileri", "finans.truncgil.com", null, () => fetch("https://finans.truncgil.com/today.json", t)),
    dene("site-veri-coingecko", "Ekodektif verileri", "CoinGecko", null, () => fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=try", t)),
    dene("site-veri-frankfurter", "Ekodektif verileri", "Frankfurter (ECB)", null, () => fetch("https://api.frankfurter.dev/v1/latest?from=USD&to=TRY", t)),
    dene("worker", "Worker", "Telegram onay Worker'ı", null, () => fetch(WORKER_URL, t)),
  ]);

  // Worker sürümü: Cloudflare'deki Worker, repodaki dashboard-paste.js'in
  // gerisinde mi? (wrangler bu hesaba bağlı değil, deploy elle yapılıyor —
  // unutulması kolay.) GET /surum { surum } BEKLENEN_WORKER_SURUMU'ndan küçükse
  // ya da uç nokta yoksa (sürüm 1'den eski kod) Worker geridedir.
  try {
    const { status, body } = await getJson<{ surum?: number }>(`${WORKER_URL}/surum`);
    const surum = status === 200 ? (body?.surum ?? 0) : 0;
    sonuclar.push(
      surum >= BEKLENEN_WORKER_SURUMU
        ? ok("worker-surum", "Worker", `Cloudflare'deki Worker güncel (sürüm ${surum})`)
        : uyari("worker-surum", "Worker", `Cloudflare'deki Worker repodaki sürümün gerisinde (canlı: ${surum || "eski"}, repo: ${BEKLENEN_WORKER_SURUMU}).`, "worker/telegram-onay/dashboard-paste.js'i Cloudflare panelinde Quick Edit'e yapıştırıp Deploy'a bas.")
    );
  } catch (err) {
    sonuclar.push(hata("worker-surum", "Worker", `Worker sürüm kontrolü: ${hataMetni(err)}`));
  }

  // Cloudflare Analytics — mevcut modül hataları yutup [] döndüğü için doğrudan dene.
  const cfToken = optionalEnv("CLOUDFLARE_API_TOKEN");
  const zone = optionalEnv("CLOUDFLARE_ZONE_ID");
  if (!cfToken || !zone) {
    sonuclar.push(uyari("analitik-cloudflare", "Analitik", "Cloudflare analitik anahtarları bu çalışmada yok."));
  } else {
    try {
      const { status, body } = await getJson<{ errors?: { message: string }[] }>("https://api.cloudflare.com/client/v4/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfToken}` },
        body: JSON.stringify({ query: `{ viewer { zones(filter: { zoneTag: "${zone}" }) { zoneTag } } }` }),
      });
      sonuclar.push(
        status === 200 && !body?.errors?.length
          ? ok("analitik-cloudflare", "Analitik", "Cloudflare Analytics erişimi çalışıyor")
          : hata("analitik-cloudflare", "Analitik", `Cloudflare Analytics: ${status} ${body?.errors?.map((e) => e.message).join("; ") ?? ""}`, "CLOUDFLARE_API_TOKEN izinlerini kontrol et.")
      );
    } catch (err) {
      sonuclar.push(hata("analitik-cloudflare", "Analitik", `Cloudflare Analytics: ${hataMetni(err)}`));
    }
  }

  if (!optionalEnv("GOOGLE_SEARCH_CONSOLE_CREDENTIALS_JSON")) {
    sonuclar.push(uyari("analitik-gsc", "Analitik", "Search Console kimlik bilgisi bu çalışmada yok."));
  } else {
    const sonuc = await searchConsoleErisimiDene();
    sonuclar.push(sonuc === true ? ok("analitik-gsc", "Analitik", "Search Console erişimi çalışıyor") : hata("analitik-gsc", "Analitik", `Search Console: ${sonuc}`, "Servis hesabının Search Console'da kullanıcı olarak ekli olduğunu kontrol et."));
  }
  return sonuclar;
}

// ---------------------------------------------------------------------------
// Sosyal kanallar — hesabın GERÇEKTEN çalıştığını ölç
// ---------------------------------------------------------------------------

export interface KanalSagligi {
  kanal: Kanal;
  /** Kimlik bilgisi var ve çalışıyor mu? */
  calisiyor: boolean;
  /** Hesaptaki gerçek gönderi sayısı (ölçülebildiyse). */
  gonderiSayisi?: number;
}

export async function kanalKontrolleri(): Promise<{ sonuclar: KontrolSonucu[]; saglik: Map<Kanal, KanalSagligi> }> {
  const sonuclar: KontrolSonucu[] = [];
  const saglik = new Map<Kanal, KanalSagligi>();
  const kaydet = (kanal: Kanal, calisiyor: boolean, gonderiSayisi?: number) => saglik.set(kanal, { kanal, calisiyor, gonderiSayisi });

  // Telegram bot + kanallar
  const botToken = optionalEnv("TELEGRAM_BOT_TOKEN");
  if (!botToken) {
    sonuclar.push(hata("telegram-bot", "Telegram", "TELEGRAM_BOT_TOKEN yok — onay ve bildirimler çalışmaz."));
  } else {
    const me = await getJson<{ ok: boolean; description?: string }>(`https://api.telegram.org/bot${botToken}/getMe`).catch(() => null);
    sonuclar.push(me?.body?.ok ? ok("telegram-bot", "Telegram", "Bot çalışıyor") : hata("telegram-bot", "Telegram", `Bot: ${me?.body?.description ?? me?.status ?? "erişilemedi"}`, "TELEGRAM_BOT_TOKEN'ı kontrol et."));
    const adminId = optionalEnv("TELEGRAM_ADMIN_CHAT_ID");
    if (adminId) {
      const chat = await getJson<{ ok: boolean; description?: string }>(`https://api.telegram.org/bot${botToken}/getChat?chat_id=${adminId}`).catch(() => null);
      sonuclar.push(chat?.body?.ok ? ok("telegram-admin", "Telegram", "Admin sohbetine erişim var") : hata("telegram-admin", "Telegram", `Admin sohbeti: ${chat?.body?.description ?? "erişilemedi"}`));
    }
    const kanalId = optionalEnv("TELEGRAM_PUBLIC_CHANNEL_ID");
    if (!kanalId) {
      sonuclar.push(uyari("kanal-telegram", "Sosyal kanallar", "Telegram herkese açık kanal tanımlı değil — bu kanala paylaşım yapılmıyor.", "Telegram'da kanal aç, botu yönetici yap, kanal kimliğini TELEGRAM_PUBLIC_CHANNEL_ID secret'ı olarak ekle."));
      kaydet("telegram", false);
    } else {
      const chat = await getJson<{ ok: boolean; description?: string }>(`https://api.telegram.org/bot${botToken}/getChat?chat_id=${kanalId}`).catch(() => null);
      const calisiyor = Boolean(chat?.body?.ok);
      sonuclar.push(calisiyor ? ok("kanal-telegram", "Sosyal kanallar", "Telegram kanalı erişilebilir") : hata("kanal-telegram", "Sosyal kanallar", `Telegram kanalı: ${chat?.body?.description ?? "erişilemedi"}`, "Botun kanalda yönetici olduğunu kontrol et."));
      kaydet("telegram", calisiyor);
    }
  }

  // Bluesky
  const bsHandle = optionalEnv("BLUESKY_HANDLE");
  const bsSifre = optionalEnv("BLUESKY_APP_PASSWORD");
  if (!bsHandle || !bsSifre) {
    sonuclar.push(hata("kanal-bluesky", "Sosyal kanallar", "Bluesky kimlik bilgileri yok.", "BLUESKY_HANDLE ve BLUESKY_APP_PASSWORD secret'larını ekle."));
    kaydet("bluesky", false);
  } else {
    try {
      const agent = new AtpAgent({ service: "https://bsky.social" });
      await agent.login({ identifier: bsHandle, password: bsSifre });
      const profil = await agent.getProfile({ actor: agent.session?.did ?? bsHandle });
      const sayi = profil.data.postsCount ?? 0;
      sonuclar.push(ok("kanal-bluesky", "Sosyal kanallar", `Bluesky girişi çalışıyor (@${profil.data.handle}, ${sayi} gönderi)`));
      kaydet("bluesky", true, sayi);
    } catch (err) {
      sonuclar.push(hata("kanal-bluesky", "Sosyal kanallar", `Bluesky girişi başarısız: ${hataMetni(err)}`, "Bluesky → Ayarlar → Uygulama şifreleri'nden yeni şifre oluşturup BLUESKY_APP_PASSWORD'ı güncelle."));
      kaydet("bluesky", false);
    }
  }

  // Threads
  const kapaliKanallar = (await readConfig().catch(() => null))?.kapaliKanallar ?? [];
  const threads = kapaliKanallar.includes("threads") ? null : await getMetaToken("threads");
  if (kapaliKanallar.includes("threads")) {
    // Hesap incelemedeyken API'ye hiç istek atma (data/config.json → kapaliKanallar).
    sonuclar.push(uyari("kanal-threads", "Sosyal kanallar", "Threads bilerek kapalı (config.kapaliKanallar) — hesap incelemesi bitince listeden çıkar.", "data/config.json'da kapaliKanallar'dan \"threads\" değerini sil."));
    kaydet("threads", false);
  } else if (!threads) {
    sonuclar.push(hata("kanal-threads", "Sosyal kanallar", "Threads token'ı okunamadı/süresi dolmuş.", "Threads token'ını yeniden bootstrap et (PLAN.md 11.2)."));
    kaydet("threads", false);
  } else {
    const me = await getJson<{ id?: string; username?: string; error?: { message: string } }>(`https://graph.threads.net/v1.0/me?fields=id,username&access_token=${threads.access_token}`).catch(() => null);
    if (me?.body?.id) {
      const liste = await getJson<{ data?: unknown[]; paging?: unknown }>(`https://graph.threads.net/v1.0/me/threads?fields=id&limit=100&access_token=${threads.access_token}`).catch(() => null);
      const sayi = liste?.body?.data?.length;
      sonuclar.push(ok("kanal-threads", "Sosyal kanallar", `Threads token'ı çalışıyor (@${me.body.username}${sayi !== undefined ? `, ${sayi} gönderi` : ""})`));
      kaydet("threads", true, sayi);
    } else {
      sonuclar.push(hata("kanal-threads", "Sosyal kanallar", `Threads API: ${me?.body?.error?.message ?? me?.metin ?? "erişilemedi"}`, "Threads token'ını yeniden bootstrap et."));
      kaydet("threads", false);
    }
    tokenSuresi(sonuclar, "threads", threads.expires_at);
  }

  // Instagram
  const ig = await getMetaToken("instagram");
  if (!ig?.ig_user_id) {
    sonuclar.push(hata("kanal-instagram", "Sosyal kanallar", "Instagram token'ı/hesap kimliği okunamadı.", "Instagram token'ını yeniden bootstrap et (PLAN.md 11.2)."));
    kaydet("instagram", false);
  } else {
    const me = await getJson<{ username?: string; media_count?: number; error?: { message: string } }>(`https://graph.instagram.com/v21.0/${ig.ig_user_id}?fields=username,media_count&access_token=${ig.access_token}`).catch(() => null);
    if (me?.body?.username) {
      sonuclar.push(ok("kanal-instagram", "Sosyal kanallar", `Instagram token'ı çalışıyor (@${me.body.username}, ${me.body.media_count ?? "?"} gönderi)`));
      kaydet("instagram", true, me.body.media_count);
    } else {
      sonuclar.push(hata("kanal-instagram", "Sosyal kanallar", `Instagram API: ${me?.body?.error?.message ?? me?.metin ?? "erişilemedi"}`, "Instagram token'ını yeniden bootstrap et."));
      kaydet("instagram", false);
    }
    tokenSuresi(sonuclar, "instagram", ig.expires_at);
  }

  // Facebook Sayfası
  const fb = await getMetaToken("facebook");
  if (!fb?.page_id) {
    sonuclar.push(hata("kanal-facebook", "Sosyal kanallar", "Facebook Sayfa token'ı/Sayfa kimliği okunamadı.", "Facebook Page token'ını yeniden bootstrap et (PLAN.md 11.2)."));
    kaydet("facebook", false);
  } else {
    const sayfa = await getJson<{ name?: string; error?: { message: string } }>(`https://graph.facebook.com/v21.0/${fb.page_id}?fields=name&access_token=${fb.access_token}`).catch(() => null);
    if (sayfa?.body?.name) {
      const gonderiler = await getJson<{ data?: unknown[] }>(`https://graph.facebook.com/v21.0/${fb.page_id}/posts?fields=id&limit=100&access_token=${fb.access_token}`).catch(() => null);
      const sayi = gonderiler?.body?.data?.length;
      sonuclar.push(ok("kanal-facebook", "Sosyal kanallar", `Facebook Sayfa token'ı çalışıyor (${sayfa.body.name}${sayi !== undefined ? `, ${sayi} gönderi` : ""})`));
      kaydet("facebook", true, sayi);
    } else {
      sonuclar.push(hata("kanal-facebook", "Sosyal kanallar", `Facebook API: ${sayfa?.body?.error?.message ?? sayfa?.metin ?? "erişilemedi"}`, "Facebook Page token'ını yeniden bootstrap et."));
      kaydet("facebook", false);
    }
    tokenSuresi(sonuclar, "facebook", fb.expires_at);
  }

  // YouTube Shorts (yükleme — trend için kullanılan API anahtarından ayrı, OAuth ister)
  if (!youtubeYapilandirildiMi()) {
    sonuclar.push(uyari("kanal-youtube", "Sosyal kanallar", "YouTube yüklemesi yapılandırılmamış — Shorts paylaşılmıyor.", "YouTube OAuth kurulumu gerekiyor (npm run youtube-yetkilendir, PLAN.md 11.9)."));
    kaydet("youtube", false);
  } else {
    try {
      const kanal = await youtubeKanalBilgisi();
      sonuclar.push(ok("kanal-youtube", "Sosyal kanallar", `YouTube yetkisi çalışıyor (${kanal.ad}, ${kanal.videoSayisi} video)`));
      kaydet("youtube", true, kanal.videoSayisi);
    } catch (err) {
      sonuclar.push(hata("kanal-youtube", "Sosyal kanallar", `YouTube: ${hataMetni(err)}`, "YouTube yetkisini yenile (npm run youtube-yetkilendir)."));
      kaydet("youtube", false);
    }
  }

  return { sonuclar, saglik };
}

function tokenSuresi(sonuclar: KontrolSonucu[], platform: string, expiresAt: number): void {
  if (expiresAt === 0) return; // süresiz
  const gun = (expiresAt - Date.now()) / (24 * SAAT_MS);
  if (gun < 7) {
    sonuclar.push(uyari(`token-${platform}`, "Sosyal kanallar", `${platform} token'ının süresi ${Math.max(0, Math.round(gun))} gün içinde doluyor.`, "Worker saatlik yenilemeyi deniyor; dolarsa yeniden bootstrap gerekir."));
  }
}

// ---------------------------------------------------------------------------
// Dağıtım tutarlılığı — kayıt ile gerçek hesabı karşılaştır
// ---------------------------------------------------------------------------

export async function dagitimKontrolleri(saglik: Map<Kanal, KanalSagligi>, onarimYap: boolean): Promise<{ sonuclar: KontrolSonucu[]; degisti: boolean; bekleyenVar: boolean }> {
  const sonuclar: KontrolSonucu[] = [];

  const durum = await readDagitimDurumu();
  const canli = await canliIcerikler();
  let degisti = false;
  /** Çalışan bir kanalda paylaşılmayı bekleyen içerik var mı? */
  let bekleyenVar = false;

  for (const kanal of KANALLAR) {
    const s = saglik.get(kanal);
    const kayitlar = Object.entries(durum).filter(([slug]) => canli.has(slug));
    const basarili = kayitlar.filter(([, d]) => d.kanallar[kanal]?.durum === "ok").length;
    const vazgecilen = kayitlar.filter(([, d]) => d.kanallar[kanal]?.durum === "vazgecildi");
    // YouTube'a yalnızca Telegram'da onaylanan Reels videoları gider — "bekleyen" kavramı yok.
    const bekleyen = kanal === "youtube" ? 0 : [...canli].filter((slug) => !durum[slug] || !durum[slug]!.kanallar[kanal] || ["bekliyor", "hata"].includes(durum[slug]!.kanallar[kanal]!.durum)).length;

    // Kayıtta "paylaşıldı" görünen ama hesapta olmayan gönderi = sessiz arıza.
    if (s?.calisiyor && s.gonderiSayisi !== undefined && s.gonderiSayisi < basarili) {
      sonuclar.push(hata(`tutarlilik-${kanal}`, "Dağıtım", `${kanal}: kayıtta ${basarili} paylaşım var ama hesapta ${s.gonderiSayisi} gönderi görünüyor.`, "Gönderiler silinmiş ya da paylaşım sessizce başarısız olmuş olabilir."));
    }

    // Kanal artık çalışıyorsa, daha önce vazgeçilmiş paylaşımları kuyruğa geri al.
    if (s?.calisiyor && vazgecilen.length > 0) {
      const k = uyari(`vazgecilen-${kanal}`, "Dağıtım", `${kanal}: ${vazgecilen.length} içeriğin paylaşımından tekrar tekrar başarısız olunca vazgeçilmişti.`);
      if (onarimYap) {
        for (const [slug] of vazgecilen) {
          durum[slug]!.kanallar[kanal] = { durum: "bekliyor", deneme: 0 };
        }
        degisti = true;
        k.onarim = "Kanal artık çalıştığı için bu içerikler dağıtım kuyruğuna geri alındı.";
      }
      sonuclar.push(k);
    }

    if (s && !s.calisiyor && bekleyen > 0) {
      sonuclar.push(uyari(`bekleyen-${kanal}`, "Dağıtım", `${kanal} çalışmadığı için ${bekleyen} içerik bu kanalda paylaşılmayı bekliyor (kanal düzelince otomatik paylaşılacak).`));
    } else if (s?.calisiyor) {
      if (bekleyen > 0 || (onarimYap && vazgecilen.length > 0)) bekleyenVar = true;
      sonuclar.push(ok(`dagitim-${kanal}`, "Dağıtım", `${kanal}: ${basarili} paylaşıldı, ${bekleyen} kuyrukta.`));
    }
  }

  if (degisti) await writeDagitimDurumu(durum);
  return { sonuclar, degisti, bekleyenVar };
}
