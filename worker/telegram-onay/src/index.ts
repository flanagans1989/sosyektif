/**
 * Telegram onay butonlarını dinleyen Cloudflare Worker.
 *
 * Yayın Ajanı bir taslağı onaya düşürdüğünde admin sohbetine
 * "✅ Yayınla" / "❌ Yayınlama" butonlu bir mesaj gider (bkz.
 * agents/src/lib/telegram.ts -> notifyAdminOnayButonlu). Kullanıcı butona
 * bastığında Telegram bu worker'a bir callback_query webhook'u yollar; worker
 * da GitHub Contents API üzerinden ilgili .md dosyasını commit ile
 * günceller (onay -> taslak:false) ya da siler (red).
 *
 * Kurulum notları wrangler.toml içinde.
 */

export interface Env {
  GITHUB_TOKEN: string;
  GITHUB_REPO: string; // "kullanici/repo"
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  TELEGRAM_ADMIN_CHAT_ID: string;
  /** GET /tetikle uç noktasını korur — bkz. dosyanın altındaki fetch handler'ı. */
  TETIKLE_ANAHTARI: string;
  /** /meta-token uç noktalarını korur (agents'ın Threads/Instagram/Facebook
   * token okuması için) — TETIKLE_ANAHTARI'dan ayrı tutulur (bkz. Bölüm 11.2). */
  AGENT_PAYLASIM_ANAHTARI: string;
  /** Tepki barı sayaçları (PLAN.md Bölüm 10 / S2). Cloudflare dashboard'da
   * "sosyektif_metrikler" KV namespace'ine bağlı — bkz. wrangler.toml notu. */
  METRIKLER: KVNamespace;
  /** İsteğe bağlı: tepki sayaçları için AYRI KV namespace. Tanımlıysa herkese açık
   * /tepki yazmaları METRIKLER'in (Meta token'ları + Reels dosyaları) günlük yazma
   * kotasını tüketemez. Yoksa METRIKLER kullanılır — bkz. wrangler.toml. */
  TEPKI?: KVNamespace;
}

/** Deploy edilen kodun sürümü; agents/src/saglik/kontroller.ts'teki
 * BEKLENEN_WORKER_SURUMU ile aynı tutulur (GET /surum). Worker kodu değişince artır. */
const WORKER_SURUMU = 2;

const POSTS_DIR = "site/src/content/posts";
// IndexNow: açık, hesap gerektirmeyen protokol. Key, site/public/<key>.txt
// dosyasıyla eşleşmeli (bkz. agents/src/lib/indexnow.ts — aynı key).
const INDEXNOW_HOST = "sosyektif.com";
const INDEXNOW_KEY = "bf89cbfcce3949c4708fcd42c7dde58a";

function b64EncodeUnicode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function b64DecodeUnicode(b64: string): string {
  const binary = atob(b64.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function ghHeaders(env: Env): HeadersInit {
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "sosyektif-telegram-onay-worker",
  };
}

/** agents/src/lib/telegram.ts -> onayKisaId ile birebir aynı algoritma. */
async function kisaId(slug: string): Promise<string> {
  const veri = new TextEncoder().encode(slug);
  const ozet = await crypto.subtle.digest("SHA-256", veri);
  const hex = [...new Uint8Array(ozet)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex.slice(0, 12);
}

/**
 * Telegram callback_data 64 bayt sınırı yüzünden mesajlarda slug yerine
 * kısa hash gönderiliyor; burada taslak klasörü listelenip aynı hash'i
 * üreten dosya bulunarak gerçek slug'a geri dönülüyor.
 */
async function resolveSlug(env: Env, id: string): Promise<string> {
  // Git Trees API: Contents API klasör listesini 1000 dosyada keser, bu sınır yok.
  const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/git/trees/main:${POSTS_DIR}`, {
    headers: ghHeaders(env),
  });
  if (!res.ok) throw new Error(`GitHub GET ${POSTS_DIR} başarısız: ${res.status} ${await res.text()}`);
  const girdiler = ((await res.json()) as { tree: { path: string; type: string }[] }).tree;
  for (const girdi of girdiler) {
    if (girdi.type !== "blob" || !girdi.path.endsWith(".md")) continue;
    const aday = girdi.path.slice(0, -3);
    if ((await kisaId(aday)) === id) return aday;
  }
  throw new Error(`"${id}" hash'ine karşılık gelen taslak bulunamadı.`);
}

async function getFile(env: Env, path: string): Promise<{ sha: string; content: string }> {
  const res = await fetch(
    `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${encodeURIComponent(path)}`,
    { headers: ghHeaders(env) }
  );
  if (!res.ok) throw new Error(`GitHub GET ${path} başarısız: ${res.status} ${await res.text()}`);
  const veri = (await res.json()) as { sha: string; content: string };
  return { sha: veri.sha, content: b64DecodeUnicode(veri.content) };
}

async function approvePost(env: Env, slug: string): Promise<void> {
  const path = `${POSTS_DIR}/${slug}.md`;
  const { sha, content } = await getFile(env, path);
  // Yalnızca frontmatter'da (ilk iki --- arası) değiştir; gövdedeki metin "taslak: true" içerse de dokunulmaz.
  const fmEslesme = /^---\r?\n[\s\S]*?\r?\n---/.exec(content);
  if (!fmEslesme || !/^taslak:\s*true\s*$/m.test(fmEslesme[0])) {
    throw new Error(`"${slug}" dosyasında "taslak: true" bulunamadı (zaten onaylanmış olabilir).`);
  }
  const yeniFm = fmEslesme[0].replace(/^taslak:\s*true\s*$/m, "taslak: false");
  const yeniIcerik = yeniFm + content.slice(fmEslesme[0].length);
  const res = await fetch(
    `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${encodeURIComponent(path)}`,
    {
      method: "PUT",
      headers: { ...ghHeaders(env), "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Onay: ${slug} Telegram butonuyla yayınlandı`,
        content: b64EncodeUnicode(yeniIcerik),
        sha,
      }),
    }
  );
  if (!res.ok) throw new Error(`GitHub PUT ${path} başarısız: ${res.status} ${await res.text()}`);

  // İçerik artık gerçekten canlı — Bing'e (IndexNow) tarama beklemeden
  // haber ver. Ücretsiz, hesap gerektirmeyen açık bir protokol; site kökünde
  // barındırılan <key>.txt dosyası sahiplik kanıtı olarak kullanılıyor.
  // Başarısızlığı onay akışını asla etkilememeli.
  const publicUrl = `https://${INDEXNOW_HOST}/${slug}/`;
  try {
    await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: INDEXNOW_HOST,
        key: INDEXNOW_KEY,
        keyLocation: `https://${INDEXNOW_HOST}/${INDEXNOW_KEY}.txt`,
        urlList: [publicUrl],
      }),
    });
  } catch (err) {
    console.warn("[indexnow] bildirim başarısız (yoksayılıyor):", err);
  }
}

async function rejectPost(env: Env, slug: string): Promise<void> {
  const path = `${POSTS_DIR}/${slug}.md`;
  const { sha } = await getFile(env, path);
  const res = await fetch(
    `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${encodeURIComponent(path)}`,
    {
      method: "DELETE",
      headers: { ...ghHeaders(env), "Content-Type": "application/json" },
      body: JSON.stringify({ message: `Red: ${slug} Telegram butonuyla silindi`, sha }),
    }
  );
  if (!res.ok) throw new Error(`GitHub DELETE ${path} başarısız: ${res.status} ${await res.text()}`);
}

async function tgCall(env: Env, method: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.error(`[tg] ${method} başarısız:`, res.status, await res.text());
}

function answerCallback(env: Env, callbackQueryId: string, text: string): Promise<void> {
  return tgCall(env, "answerCallbackQuery", { callback_query_id: callbackQueryId, text, show_alert: false });
}

function sendAdminMessage(env: Env, text: string): Promise<void> {
  return tgCall(env, "sendMessage", { chat_id: env.TELEGRAM_ADMIN_CHAT_ID, text, parse_mode: "HTML" });
}

const SITE_ORIGIN = "https://sosyektif.com";

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": SITE_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Sır karşılaştırması: sabit zamanlı (iki tarafın SHA-256 özeti karşılaştırılır)
 * ve beklenen sır tanımsız/boşsa HİÇBİR girdiyi kabul etmez (boş `?anahtar=`
 * boş bir secret ile eşleşip kapıyı açmasın).
 */
async function sirEsit(gelen: string | null, beklenen: string | undefined): Promise<boolean> {
  if (!gelen || !beklenen) return false;
  const kodla = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", kodla.encode(gelen)),
    crypto.subtle.digest("SHA-256", kodla.encode(beklenen)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let fark = 0;
  for (let i = 0; i < x.length; i++) fark |= x[i]! ^ y[i]!;
  return fark === 0;
}

/**
 * Basit hız sınırı (istemci IP'si + uç nokta başına). Sayaç bellekte, yani
 * yalnızca o Worker örneği (isolate) için geçerli — kaba ama ücretsiz bir
 * ilk savunma. Asıl koruma için Cloudflare panelinde /tepki ve /bildir'e bir
 * WAF "Rate limiting rule" eklenmesi önerilir (bkz. wrangler.toml).
 * true = izin verildi.
 */
const hizSayaclari = new Map<string, { sayi: number; bitis: number }>();
function hizSiniri(anahtar: string, maks: number, pencereMs: number): boolean {
  const simdi = Date.now();
  if (hizSayaclari.size > 5000) {
    for (const [k, v] of hizSayaclari) if (v.bitis < simdi) hizSayaclari.delete(k);
  }
  const kayit = hizSayaclari.get(anahtar);
  if (!kayit || kayit.bitis < simdi) {
    hizSayaclari.set(anahtar, { sayi: 1, bitis: simdi + pencereMs });
    return true;
  }
  kayit.sayi += 1;
  return kayit.sayi <= maks;
}

function istemciIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? "bilinmiyor";
}

/** Tarayıcıdan gelen çapraz-kaynak POST'ları her zaman Origin taşır; CORS tek
 * başına sunucuyu korumaz, bu yüzden başka kaynaktan gelenleri burada reddet. */
function originGecerli(request: Request): boolean {
  return request.headers.get("Origin") === SITE_ORIGIN;
}

const TEPKI_TURLERI = ["sasirdim", "guldum", "inanmadim", "bilgilendim"] as const;
type TepkiTuru = (typeof TEPKI_TURLERI)[number];
type TepkiSayaclari = Record<TepkiTuru, number>;

function bosTepkiSayaclari(): TepkiSayaclari {
  return { sasirdim: 0, guldum: 0, inanmadim: 0, bilgilendim: 0 };
}

/** Slug'ları KV anahtarı olarak güvenli hale getirir — build'de üretilen
 * gerçek slug'lar zaten [a-z0-9-] setinde, burada sadece savunma amaçlı. */
function slugTemizle(slug: string): string | null {
  const temiz = slug.trim().toLowerCase().slice(0, 200);
  return /^[a-z0-9-]+$/.test(temiz) ? temiz : null;
}

/** Tepki sayaçlarının KV'si: ayrı TEPKI namespace'i bağlıysa o, değilse METRIKLER. */
function tepkiKV(env: Env): KVNamespace {
  return env.TEPKI ?? env.METRIKLER;
}

/** Slug gerçek bir yazıya mı ait? Sitede HEAD isteği (kenarda önbelleğe alınır:
 * var olan yazı 1 saat, olmayan 5 dk) — rastgele slug'larla KV anahtarı üretilemesin. */
async function yaziVarMi(slug: string): Promise<boolean> {
  try {
    const res = await fetch(`${SITE_ORIGIN}/${slug}/`, {
      method: "HEAD",
      cf: { cacheEverything: true, cacheTtlByStatus: { "200-299": 3600, "404": 300, "500-599": 0 } },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Tepki barı (PLAN.md Bölüm 10 / S2). Sitedeki her içeriğin altında dört
 * emoji tepkiden birine tıklanabilir; sayaçlar KV'de slug başına tek bir
 * JSON kayıtta tutulur (günlük anahtar biriktirmesi yok — mevcut trafik
 * hacminde ücretsiz katmanın 1000 yazma/gün sınırına yaklaşmak yıllar alır;
 * trafik büyürse bu fonksiyon Durable Object'e taşınabilir).
 * Çift oy engeli sunucuda yok, istemcide localStorage ile yapılıyor —
 * amaç kesin sayım değil, kaba bir ilgi sinyali.
 */
async function tepkiVer(request: Request, env: Env): Promise<Response> {
  let govde: { slug?: string; tepki?: string };
  try {
    govde = await request.json();
  } catch {
    return new Response("geçersiz istek", { status: 400, headers: corsHeaders() });
  }

  const slug = slugTemizle(govde.slug ?? "");
  const tepki = govde.tepki as TepkiTuru | undefined;
  if (!slug || !tepki || !TEPKI_TURLERI.includes(tepki)) {
    return new Response("geçersiz slug/tepki", { status: 400, headers: corsHeaders() });
  }

  // Herkese açık ve kimliksiz uç nokta: KV yazma kotası (ücretsiz katmanda günde
  // 1000) burada tüketilebilir. Yalnızca site kaynaklı, IP başına sınırlı ve
  // gerçekten var olan bir yazı için yaz.
  if (!originGecerli(request)) return new Response("forbidden", { status: 403, headers: corsHeaders() });
  if (!hizSiniri(`tepki:${istemciIp(request)}`, 10, 60_000)) {
    return new Response("çok fazla istek", { status: 429, headers: corsHeaders() });
  }
  if (!(await yaziVarMi(slug))) return new Response("bilinmeyen yazı", { status: 404, headers: corsHeaders() });

  const kv = tepkiKV(env);
  const anahtar = `tepki:${slug}`;
  const mevcut = (await kv.get(anahtar)) ?? (kv !== env.METRIKLER ? await env.METRIKLER.get(anahtar) : null);
  const sayaclar: TepkiSayaclari = mevcut ? JSON.parse(mevcut) : bosTepkiSayaclari();
  sayaclar[tepki] += 1;
  await kv.put(anahtar, JSON.stringify(sayaclar));

  return new Response(JSON.stringify(sayaclar), {
    status: 200,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
}

async function tepkiSonucGetir(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const slug = slugTemizle(url.searchParams.get("slug") ?? "");
  if (!slug) return new Response("geçersiz slug", { status: 400, headers: corsHeaders() });

  const kv = tepkiKV(env);
  const mevcut = (await kv.get(`tepki:${slug}`)) ?? (kv !== env.METRIKLER ? await env.METRIKLER.get(`tepki:${slug}`) : null);
  const sayaclar: TepkiSayaclari = mevcut ? JSON.parse(mevcut) : bosTepkiSayaclari();
  return new Response(JSON.stringify(sayaclar), {
    status: 200,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
}

type MetaPlatform = "threads" | "instagram" | "facebook";

interface MetaToken {
  access_token: string;
  /** Unix ms cinsinden son kullanma zamanı. */
  expires_at: number;
  /** Yalnızca Instagram için: Graph API çağrılarında kullanılan hesap ID'si. */
  ig_user_id?: string;
  /** Yalnızca Facebook için: Sayfa ID'si (Page Access Token, kullanıcı token'ından ayrı). */
  page_id?: string;
}

function metaTokenAnahtari(platform: MetaPlatform): string {
  return `meta_token:${platform}`;
}

/**
 * Threads/Instagram uzun ömürlü erişim token'ları (PLAN.md Bölüm 11.2).
 * Bootstrap (ilk token) ve periyodik yenileme burada okur/yazar; ajanlar
 * (GitHub Actions'ta çalışan Node.js süreçleri) KV'ye doğrudan erişemediği
 * için bu uç noktalar üzerinden okur. Aynı `anahtar` sorgu parametresi
 * /tetikle ile aynı sırrı kullanır — GitHub/Telegram token'larına erişim
 * vermez, yalnızca bu iki uç noktayı korur.
 */
async function metaTokenGetir(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (!(await sirEsit(url.searchParams.get("anahtar"), env.AGENT_PAYLASIM_ANAHTARI))) {
    return new Response("forbidden", { status: 403 });
  }
  const platform = url.searchParams.get("platform");
  if (platform !== "threads" && platform !== "instagram" && platform !== "facebook") {
    return new Response("geçersiz platform", { status: 400 });
  }
  const mevcut = await env.METRIKLER.get(metaTokenAnahtari(platform));
  if (!mevcut) return new Response("bulunamadı", { status: 404 });
  return new Response(mevcut, { status: 200, headers: { "Content-Type": "application/json" } });
}

/**
 * Geçici video barındırma (PLAN.md Bölüm 11.9). Instagram Reels ve Facebook
 * videoyu herkese açık bir URL'den çekiyor. Önceden ~12MB'lık her Reels bu
 * yüzden git'e commit'lenip Cloudflare Pages'ten sunuluyordu — silinse bile
 * git geçmişinde kalıyor, repo birkaç haftada GitHub'ın 1GB sınırına
 * yaklaşacaktı. Artık video 3 günlüğüne KV'ye konup buradan sunuluyor
 * (KV değer sınırı 25MB, süre dolunca kendiliğinden silinir).
 */
const GECICI_DOSYA_TTL_SN = 3 * 24 * 60 * 60;
const GECICI_DOSYA_AD = /^[a-z0-9-]{1,180}\.mp4$/;

async function geciciDosyaYaz(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (!(await sirEsit(url.searchParams.get("anahtar"), env.AGENT_PAYLASIM_ANAHTARI))) {
    return new Response("forbidden", { status: 403 });
  }
  const ad = url.searchParams.get("ad") ?? "";
  if (!GECICI_DOSYA_AD.test(ad)) return new Response("geçersiz dosya adı", { status: 400 });
  const icerik = await request.arrayBuffer();
  if (icerik.byteLength === 0 || icerik.byteLength > 25 * 1024 * 1024) {
    return new Response("dosya boş ya da 25MB'tan büyük", { status: 413 });
  }
  await env.METRIKLER.put(`gecici:${ad}`, icerik, { expirationTtl: GECICI_DOSYA_TTL_SN });
  return Response.json({ url: `${url.origin}/gecici/${ad}` });
}

async function geciciDosyaGetir(ad: string, env: Env): Promise<Response> {
  if (!GECICI_DOSYA_AD.test(ad)) return new Response("bulunamadı", { status: 404 });
  const icerik = await env.METRIKLER.get(`gecici:${ad}`, "arrayBuffer");
  if (!icerik) return new Response("bulunamadı", { status: 404 });
  return new Response(icerik, {
    headers: { "Content-Type": "video/mp4", "Content-Length": String(icerik.byteLength), "Cache-Control": "public, max-age=3600" },
  });
}

async function metaTokenYaz(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (!(await sirEsit(url.searchParams.get("anahtar"), env.AGENT_PAYLASIM_ANAHTARI))) {
    return new Response("forbidden", { status: 403 });
  }
  let govde: {
    platform?: string;
    access_token?: string;
    expires_at?: number;
    ig_user_id?: string;
    page_id?: string;
  };
  try {
    govde = await request.json();
  } catch {
    return new Response("geçersiz istek", { status: 400 });
  }
  if (
    (govde.platform !== "threads" && govde.platform !== "instagram" && govde.platform !== "facebook") ||
    !govde.access_token ||
    typeof govde.expires_at !== "number"
  ) {
    return new Response("geçersiz alanlar", { status: 400 });
  }
  const token: MetaToken = {
    access_token: govde.access_token,
    expires_at: govde.expires_at,
    ig_user_id: govde.ig_user_id,
    page_id: govde.page_id,
  };
  await env.METRIKLER.put(metaTokenAnahtari(govde.platform), JSON.stringify(token));
  return new Response("ok");
}

/**
 * Süresi 5 günden az kalan token'ları yeniler. Threads ve Instagram'ın
 * "refresh_access_token" uç noktaları yalnızca mevcut uzun ömürlü token'ı
 * ister — app secret gerekmez (bootstrap'tan farklı). Başarısızlık
 * (ör. token zaten süresi dolmuş) admin'e Telegram'dan bildirilir; bir
 * sonraki bootstrap'a kadar o platformun paylaşımı sessizce atlanmaya
 * devam eder (agents/src/lib/threads.ts ve instagram.ts token yoksa/eskiyse
 * paylaşımı atlar).
 *
 * Facebook bu döngüde YOK: Sayfa (Page) Access Token'ların Threads/
 * Instagram'daki gibi basit bir "refresh_access_token" ucu yok — uzun ömürlü
 * bir kullanıcı token'ından türetildiği için kullanıcı token'ı geçerli
 * kaldıkça pratikte süresiz sayılır (bootstrap'ta expires_at uzak bir
 * tarihe ayarlanır). Süresi dolarsa yeniden bootstrap gerekir.
 */
async function metaTokenlariYenile(env: Env): Promise<void> {
  const BES_GUN_MS = 5 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  // Facebook burada yok (bkz. yukarıdaki yorum) — döngü de yalnızca bu ikisini gezer.
  const yenilemeUclari: Record<"threads" | "instagram", string> = {
    threads: "https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=",
    instagram: "https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=",
  };

  for (const platform of ["threads", "instagram"] as const) {
    const mevcutRaw = await env.METRIKLER.get(metaTokenAnahtari(platform));
    if (!mevcutRaw) continue; // henüz bootstrap edilmemiş — sessizce atla
    const mevcut: MetaToken = JSON.parse(mevcutRaw);
    if (mevcut.expires_at - now > BES_GUN_MS) continue; // henüz erken

    try {
      const res = await fetch(`${yenilemeUclari[platform]}${mevcut.access_token}`);
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      const veri = (await res.json()) as { access_token: string; expires_in: number };
      const yeni: MetaToken = {
        access_token: veri.access_token,
        expires_at: now + veri.expires_in * 1000,
        ig_user_id: mevcut.ig_user_id,
      };
      await env.METRIKLER.put(metaTokenAnahtari(platform), JSON.stringify(yeni));
      console.log(`[meta-token] ${platform} yenilendi`);
    } catch (err) {
      const mesaj = err instanceof Error ? err.message : String(err);
      console.error(`[meta-token] ${platform} yenilenemedi:`, mesaj);
      await tgCall(env, "sendMessage", {
        chat_id: env.TELEGRAM_ADMIN_CHAT_ID,
        text: `⚠️ ${platform} token'ı yenilenemedi (süresi dolmak üzere/doldu):\n${mesaj.slice(0, 300)}\n\nYeniden bootstrap gerekebilir.`,
      });
    }
  }
}

/**
 * Düzeltme/kaldırma talep formu (PLAN.md §5, Bölüm 10 / S7). KV veya başka
 * bir depolama gerektirmez — gelen talep doğrudan admin sohbetine düşer.
 * Kaba hız sınırlaması: mesaj uzunluğu + basit bir honeypot alanı
 * (bot'lar genelde her alanı doldurur, insan "web_sitesi" alanını boş bırakır).
 */
async function bildirimGonder(request: Request, env: Env): Promise<Response> {
  let gövde: { eposta?: string; mesaj?: string; sayfaUrl?: string; web_sitesi?: string };
  try {
    gövde = await request.json();
  } catch {
    return new Response("geçersiz istek", { status: 400, headers: corsHeaders() });
  }

  // Honeypot: gizli alan doluysa sessizce "başarılı" dön, bot'u oyalama.
  if (gövde.web_sitesi) {
    return new Response("ok", { status: 200, headers: corsHeaders() });
  }

  // Kimliksiz uç nokta admin sohbetine yazıyor: sel olursa aynı bot üzerinden
  // gelen onay mesajları da Telegram'ın sohbet başına hız sınırına takılır.
  if (!originGecerli(request)) return new Response("forbidden", { status: 403, headers: corsHeaders() });
  if (!hizSiniri(`bildir:${istemciIp(request)}`, 3, 10 * 60_000) || !hizSiniri("bildir:genel", 20, 60 * 60_000)) {
    return new Response("çok fazla istek, lütfen daha sonra tekrar deneyin", { status: 429, headers: corsHeaders() });
  }

  const mesaj = (gövde.mesaj ?? "").trim().slice(0, 2000);
  const eposta = (gövde.eposta ?? "").trim().slice(0, 200);
  const sayfaUrl = (gövde.sayfaUrl ?? "").trim().slice(0, 300);

  if (!mesaj || mesaj.length < 10) {
    return new Response("mesaj çok kısa", { status: 400, headers: corsHeaders() });
  }

  await sendAdminMessage(
    env,
    `📩 <b>Düzeltme/kaldırma talebi</b>\n` +
      (sayfaUrl ? `Sayfa: ${escapeHtml(sayfaUrl)}\n` : "") +
      (eposta ? `E-posta: ${escapeHtml(eposta)}\n` : "(e-posta verilmemiş)\n") +
      `\n${escapeHtml(mesaj)}`
  );

  return new Response("ok", { status: 200, headers: corsHeaders() });
}

function editMessage(env: Env, chatId: number, messageId: number, text: string): Promise<void> {
  return tgCall(env, "editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [] },
  });
}

/** Video mesajlarında metin değil açıklama (caption) düzenlenir — editMessageText hata verir. */
function editCaption(env: Env, chatId: number, messageId: number, caption: string): Promise<void> {
  return tgCall(env, "editMessageCaption", {
    chat_id: chatId,
    message_id: messageId,
    caption,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [] },
  });
}

/**
 * Saatlik tetikleme (Cloudflare cron VE/YA DA dışarıdan cron-job.org ile
 * GET /tetikle çağrısı — bkz. wrangler.toml) → UTC saatine göre hangi
 * workflow'ların başlatılacağı.
 *
 * pipeline.yml HER saat tetiklenir; yayın zamanlaması (TR 08-24 arası, iki
 * içerik arası en az 3 saat, günlük hedef) agents/src/orchestrator/pipeline.ts
 * içinde kontrol edildiği için burada saat kısıtlamaya gerek yok — gereksiz
 * çağrılar orada zaten no-op olarak biter.
 */
const ZAMANLAMA: { workflow: string; saatler: number[] | "hepsi"; sadecePazartesi?: boolean }[] = [
  { workflow: "pipeline.yml", saatler: "hepsi" },
  // Dağıtım kuyruğu: başarısız paylaşımları tekrar dener, eski içerikleri saatte bir paylaşır.
  { workflow: "dagitim.yml", saatler: "hepsi" },
  // Gözetim ajanı sağlık denetimi (06 UTC = TR 09:00 çalışması günlük tam rapor).
  { workflow: "saglik-denetimi.yml", saatler: [0, 6, 12, 18] },
  { workflow: "burc.yml", saatler: [2] }, // TR 05:00 — insanlar uyanmadan
  { workflow: "daily-report.yml", saatler: [6] }, // TR 09:00
  { workflow: "weekly-analytics.yml", saatler: [5], sadecePazartesi: true },
];

async function workflowBaslat(env: Env, workflow: string, inputs?: Record<string, string>): Promise<void> {
  const res = await fetch(
    `https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${workflow}/dispatches`,
    {
      method: "POST",
      headers: { ...ghHeaders(env), "Content-Type": "application/json" },
      body: JSON.stringify(inputs ? { ref: "main", inputs } : { ref: "main" }),
    }
  );
  if (!res.ok) throw new Error(`${workflow} başlatılamadı: ${res.status} ${await res.text()}`);
}

async function zamanlanmisCalisma(env: Env, zaman: Date): Promise<void> {
  await metaTokenlariYenile(env).catch((err) =>
    console.error("[meta-token] yenileme döngüsü hata:", err)
  );

  const saat = zaman.getUTCHours();
  const pazartesi = zaman.getUTCDay() === 1;
  const baslatilacaklar = ZAMANLAMA.filter(
    (z) => (z.saatler === "hepsi" || z.saatler.includes(saat)) && (!z.sadecePazartesi || pazartesi)
  ).map((z) => z.workflow);

  console.log(`[cron] saat ${saat}, başlatılacaklar: ${JSON.stringify(baslatilacaklar)}`);
  const hatalar: string[] = [];
  for (const workflow of baslatilacaklar) {
    try {
      await workflowBaslat(env, workflow);
      console.log(`[cron] ${workflow} başlatıldı`);
    } catch (err) {
      const mesaj = err instanceof Error ? err.message : String(err);
      console.error(`[cron] ${workflow} hata: ${mesaj}`);
      hatalar.push(mesaj);
    }
  }
  // Sessiz arıza olmasın: tetikleme başarısızsa admin'e haber ver.
  if (hatalar.length > 0) {
    await tgCall(env, "sendMessage", {
      chat_id: env.TELEGRAM_ADMIN_CHAT_ID,
      text: `⚠️ Zamanlayıcı workflow başlatamadı:\n${hatalar.join("\n").slice(0, 800)}`,
    });
  }
}

interface TelegramCallbackQuery {
  id: string;
  data?: string;
  message?: { chat: { id: number }; message_id: number };
}

export default {
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(zamanlanmisCalisma(env, new Date(event.scheduledTime)));
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/bildir") {
      if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });
      if (request.method === "POST") return bildirimGonder(request, env);
      return new Response("method not allowed", { status: 405, headers: corsHeaders() });
    }

    if (url.pathname === "/tepki") {
      if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });
      if (request.method === "POST") return tepkiVer(request, env);
      return new Response("method not allowed", { status: 405, headers: corsHeaders() });
    }

    // Sağlık denetimi: Cloudflare'deki kod repodaki sürümün gerisinde mi? (deploy elle yapılıyor)
    if (url.pathname === "/surum" && request.method === "GET") return Response.json({ surum: WORKER_SURUMU });

    if (url.pathname === "/gecici-dosya" && request.method === "PUT") return geciciDosyaYaz(request, env);
    if (url.pathname.startsWith("/gecici/") && (request.method === "GET" || request.method === "HEAD")) {
      return geciciDosyaGetir(url.pathname.slice("/gecici/".length), env);
    }

    if (url.pathname === "/meta-token") {
      if (request.method === "GET") return metaTokenGetir(request, env);
      if (request.method === "POST") return metaTokenYaz(request, env);
      return new Response("method not allowed", { status: 405 });
    }

    if (url.pathname === "/tepki-sonuc") {
      if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });
      if (request.method === "GET") return tepkiSonucGetir(request, env);
      return new Response("method not allowed", { status: 405, headers: corsHeaders() });
    }

    // Cloudflare'in kendi cron tetikleyicisi bu hesapta kayıtlı görünmesine
    // rağmen hiç çalışmadı (2026-09-11, wrangler tail ile canlı doğrulandı:
    // dakikada bir tetiklenen bir cron 3 dakika boyunca hiçbir zamanlanmış
    // çağrı üretmedi). Yedek/asıl tetikleyici: dışarıdan (cron-job.org) saatte
    // bir bu uç noktaya yapılan basit bir GET isteği. `anahtar` sorgu
    // parametresi yalnızca bu isteğin yetkili olduğunu doğrular; GitHub ya da
    // Telegram token'larına erişim vermez.
    if (request.method === "GET" && url.pathname === "/tetikle") {
      if (!(await sirEsit(url.searchParams.get("anahtar"), env.TETIKLE_ANAHTARI))) {
        return new Response("forbidden", { status: 403 });
      }
      const zaman = new Date();
      console.log(`[tetikle] çağrıldı, UTC saat: ${zaman.getUTCHours()}`);
      await zamanlanmisCalisma(env, zaman);
      return new Response("ok");
    }

    if (request.method !== "POST") return new Response("ok");

    const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (!(await sirEsit(secret, env.TELEGRAM_WEBHOOK_SECRET))) return new Response("forbidden", { status: 403 });

    const update = (await request.json()) as { callback_query?: TelegramCallbackQuery };
    const cq = update.callback_query;
    if (!cq || !cq.message) return new Response("ok");

    if (String(cq.message.chat.id) !== env.TELEGRAM_ADMIN_CHAT_ID) {
      await answerCallback(env, cq.id, "Yetkisiz.");
      return new Response("ok");
    }

    const [aksiyon, id] = (cq.data ?? "").split(":");
    if (!id || !["approve", "reject", "reel_ok", "reel_no"].includes(aksiyon ?? "")) {
      await answerCallback(env, cq.id, "Geçersiz istek.");
      return new Response("ok");
    }

    // Reels onayı (PLAN.md Bölüm 11.9, agents/src/distribute/reel.ts): video
    // mesajının altındaki butonlar. Paylaşımın kendisi (video üretimi,
    // siteye yükleme, Instagram/Facebook) dakikalar sürdüğü için worker'da
    // değil GitHub Actions'ta (reel-paylas.yml) yapılır — worker sadece başlatır.
    if (aksiyon === "reel_ok" || aksiyon === "reel_no") {
      const chatId = cq.message.chat.id;
      const mesajId = cq.message.message_id;
      if (aksiyon === "reel_no") {
        await answerCallback(env, cq.id, "Paylaşılmayacak.");
        await editCaption(env, chatId, mesajId, "❌ <b>Reels paylaşılmadı</b>");
        return new Response("ok");
      }
      await answerCallback(env, cq.id, "Paylaşım başlatılıyor…");
      try {
        const slug = await resolveSlug(env, id);
        await workflowBaslat(env, "reel-paylas.yml", { slug });
        await editCaption(
          env,
          chatId,
          mesajId,
          `✅ <b>Onaylandı</b> — Reels hazırlanıp paylaşılıyor (~5 dk), bitince haber gelecek.\n${slug}`
        );
      } catch (err) {
        console.error(err);
        const mesaj = err instanceof Error ? err.message : String(err);
        await editCaption(env, chatId, mesajId, `⚠️ <b>Paylaşım başlatılamadı</b>\n${mesaj.slice(0, 300)}`);
      }
      return new Response("ok");
    }

    // ÖNEMLİ: callback_query'ye Telegram'ın beklediği kısa sürede cevap
    // verilmezse ("query too old" vb.) istemci hata gösterir — GitHub'daki
    // asıl işlem (birkaç ardışık API çağrısı) o pencereyi kolayca aşabilir.
    // Bu yüzden önce anında "işleniyor" cevabı veriliyor, asıl sonuç ise
    // (başarı ya da hata fark etmeksizin) mesaj düzenlemesiyle bildiriliyor —
    // editMessageText'in böyle bir zaman sınırı yok.
    await answerCallback(env, cq.id, "İşleniyor…");

    try {
      const slug = await resolveSlug(env, id);
      if (aksiyon === "approve") {
        await approvePost(env, slug);
        // Elle onaylanan içerik de sosyal medyada paylaşılsın (önceden hiç
        // paylaşılmıyordu). Kuyruk, site build'i bitip link canlıya çıkınca paylaşır.
        let dagitimNotu = "📣 Sosyal medya paylaşımı birkaç dakika içinde başlayacak.";
        try {
          await workflowBaslat(env, "dagitim.yml");
        } catch (err) {
          console.error(err);
          dagitimNotu = "⚠️ Dağıtım hemen başlatılamadı; saatlik kuyruk paylaşacak.";
        }
        await editMessage(env, cq.message.chat.id, cq.message.message_id, `✅ <b>Yayınlandı</b> — ${slug}
${dagitimNotu}`);
      } else {
        await rejectPost(env, slug);
        await editMessage(env, cq.message.chat.id, cq.message.message_id, `❌ <b>Yayınlanmadı</b> (silindi) — ${slug}`);
      }
    } catch (err) {
      console.error(err);
      const mesaj = err instanceof Error ? err.message : String(err);
      await editMessage(
        env,
        cq.message.chat.id,
        cq.message.message_id,
        `⚠️ <b>Hata oluştu</b>\n${mesaj.slice(0, 300)}\n\nGitHub'ı elle kontrol edin, işlem tamamlanmamış olabilir.`
      );
    }

    return new Response("ok");
  },
};
