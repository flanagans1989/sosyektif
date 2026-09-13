/**
 * Cloudflare dashboard "Quick Edit" için düz JS derlemesi.
 * Kaynak/yorumlu sürüm: src/index.ts (mantık birebir aynı, `npx tsc` ile
 * tipleri soyulmuş hali). Bu dosyayı Workers & Pages > sosyektif-telegram-onay
 * (deraks-rental.workers.dev alt alan adındaki Cloudflare hesabı) >
 * Edit Code alanına olduğu gibi yapıştırıp Deploy'a bas.
 */

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
const POSTS_DIR = "site/src/content/posts";
// IndexNow: açık, hesap gerektirmeyen protokol. Key, site/public/<key>.txt
// dosyasıyla eşleşmeli (bkz. agents/src/lib/indexnow.ts — aynı key).
const INDEXNOW_HOST = "sosyektif.com";
const INDEXNOW_KEY = "bf89cbfcce3949c4708fcd42c7dde58a";
function b64EncodeUnicode(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = "";
    bytes.forEach((b) => (binary += String.fromCharCode(b)));
    return btoa(binary);
}
function b64DecodeUnicode(b64) {
    const binary = atob(b64.replace(/\n/g, ""));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
}
function ghHeaders(env) {
    return {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "sosyektif-telegram-onay-worker",
    };
}
/** agents/src/lib/telegram.ts -> onayKisaId ile birebir aynı algoritma. */
async function kisaId(slug) {
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
async function resolveSlug(env, id) {
    const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/contents/${encodeURIComponent(POSTS_DIR)}`, { headers: ghHeaders(env) });
    if (!res.ok)
        throw new Error(`GitHub GET ${POSTS_DIR} başarısız: ${res.status} ${await res.text()}`);
    const girdiler = (await res.json());
    for (const girdi of girdiler) {
        if (!girdi.name.endsWith(".md"))
            continue;
        const aday = girdi.name.slice(0, -3);
        if ((await kisaId(aday)) === id)
            return aday;
    }
    throw new Error(`"${id}" hash'ine karşılık gelen taslak bulunamadı.`);
}
async function getFile(env, path) {
    const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/contents/${encodeURIComponent(path)}`, { headers: ghHeaders(env) });
    if (!res.ok)
        throw new Error(`GitHub GET ${path} başarısız: ${res.status} ${await res.text()}`);
    const veri = (await res.json());
    return { sha: veri.sha, content: b64DecodeUnicode(veri.content) };
}
async function approvePost(env, slug) {
    const path = `${POSTS_DIR}/${slug}.md`;
    const { sha, content } = await getFile(env, path);
    if (!/taslak:\s*true/.test(content)) {
        throw new Error(`"${slug}" dosyasında "taslak: true" bulunamadı (zaten onaylanmış olabilir).`);
    }
    const yeniIcerik = content.replace(/taslak:\s*true/, "taslak: false");
    const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/contents/${encodeURIComponent(path)}`, {
        method: "PUT",
        headers: { ...ghHeaders(env), "Content-Type": "application/json" },
        body: JSON.stringify({
            message: `Onay: ${slug} Telegram butonuyla yayınlandı`,
            content: b64EncodeUnicode(yeniIcerik),
            sha,
        }),
    });
    if (!res.ok)
        throw new Error(`GitHub PUT ${path} başarısız: ${res.status} ${await res.text()}`);
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
    }
    catch (err) {
        console.warn("[indexnow] bildirim başarısız (yoksayılıyor):", err);
    }
}
async function rejectPost(env, slug) {
    const path = `${POSTS_DIR}/${slug}.md`;
    const { sha } = await getFile(env, path);
    const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/contents/${encodeURIComponent(path)}`, {
        method: "DELETE",
        headers: { ...ghHeaders(env), "Content-Type": "application/json" },
        body: JSON.stringify({ message: `Red: ${slug} Telegram butonuyla silindi`, sha }),
    });
    if (!res.ok)
        throw new Error(`GitHub DELETE ${path} başarısız: ${res.status} ${await res.text()}`);
}
async function tgCall(env, method, body) {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!res.ok)
        console.error(`[tg] ${method} başarısız:`, res.status, await res.text());
}
function answerCallback(env, callbackQueryId, text) {
    return tgCall(env, "answerCallbackQuery", { callback_query_id: callbackQueryId, text, show_alert: false });
}
function sendAdminMessage(env, text) {
    return tgCall(env, "sendMessage", { chat_id: env.TELEGRAM_ADMIN_CHAT_ID, text, parse_mode: "HTML" });
}
const SITE_ORIGIN = "https://sosyektif.com";
function corsHeaders() {
    return {
        "Access-Control-Allow-Origin": SITE_ORIGIN,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };
}
function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
const TEPKI_TURLERI = ["sasirdim", "guldum", "inanmadim", "bilgilendim"];
function bosTepkiSayaclari() {
    return { sasirdim: 0, guldum: 0, inanmadim: 0, bilgilendim: 0 };
}
/** Slug'ları KV anahtarı olarak güvenli hale getirir — build'de üretilen
 * gerçek slug'lar zaten [a-z0-9-] setinde, burada sadece savunma amaçlı. */
function slugTemizle(slug) {
    const temiz = slug.trim().toLowerCase().slice(0, 200);
    return /^[a-z0-9-]+$/.test(temiz) ? temiz : null;
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
async function tepkiVer(request, env) {
    let govde;
    try {
        govde = await request.json();
    }
    catch {
        return new Response("geçersiz istek", { status: 400, headers: corsHeaders() });
    }
    const slug = slugTemizle(govde.slug ?? "");
    const tepki = govde.tepki;
    if (!slug || !tepki || !TEPKI_TURLERI.includes(tepki)) {
        return new Response("geçersiz slug/tepki", { status: 400, headers: corsHeaders() });
    }
    const anahtar = `tepki:${slug}`;
    const mevcut = await env.METRIKLER.get(anahtar);
    const sayaclar = mevcut ? JSON.parse(mevcut) : bosTepkiSayaclari();
    sayaclar[tepki] += 1;
    await env.METRIKLER.put(anahtar, JSON.stringify(sayaclar));
    return new Response(JSON.stringify(sayaclar), {
        status: 200,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
}
async function tepkiSonucGetir(request, env) {
    const url = new URL(request.url);
    const slug = slugTemizle(url.searchParams.get("slug") ?? "");
    if (!slug)
        return new Response("geçersiz slug", { status: 400, headers: corsHeaders() });
    const mevcut = await env.METRIKLER.get(`tepki:${slug}`);
    const sayaclar = mevcut ? JSON.parse(mevcut) : bosTepkiSayaclari();
    return new Response(JSON.stringify(sayaclar), {
        status: 200,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
}
function metaTokenAnahtari(platform) {
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
async function metaTokenGetir(request, env) {
    const url = new URL(request.url);
    if (url.searchParams.get("anahtar") !== env.AGENT_PAYLASIM_ANAHTARI) {
        return new Response("forbidden", { status: 403 });
    }
    const platform = url.searchParams.get("platform");
    if (platform !== "threads" && platform !== "instagram" && platform !== "facebook") {
        return new Response("geçersiz platform", { status: 400 });
    }
    const mevcut = await env.METRIKLER.get(metaTokenAnahtari(platform));
    if (!mevcut)
        return new Response("bulunamadı", { status: 404 });
    return new Response(mevcut, { status: 200, headers: { "Content-Type": "application/json" } });
}
async function metaTokenYaz(request, env) {
    const url = new URL(request.url);
    if (url.searchParams.get("anahtar") !== env.AGENT_PAYLASIM_ANAHTARI) {
        return new Response("forbidden", { status: 403 });
    }
    let govde;
    try {
        govde = await request.json();
    }
    catch {
        return new Response("geçersiz istek", { status: 400 });
    }
    if ((govde.platform !== "threads" && govde.platform !== "instagram" && govde.platform !== "facebook") ||
        !govde.access_token ||
        typeof govde.expires_at !== "number") {
        return new Response("geçersiz alanlar", { status: 400 });
    }
    const token = {
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
async function metaTokenlariYenile(env) {
    const BES_GUN_MS = 5 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    // Facebook burada yok (bkz. yukarıdaki yorum) — döngü de yalnızca bu ikisini gezer.
    const yenilemeUclari = {
        threads: "https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=",
        instagram: "https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=",
    };
    for (const platform of ["threads", "instagram"]) {
        const mevcutRaw = await env.METRIKLER.get(metaTokenAnahtari(platform));
        if (!mevcutRaw)
            continue; // henüz bootstrap edilmemiş — sessizce atla
        const mevcut = JSON.parse(mevcutRaw);
        if (mevcut.expires_at - now > BES_GUN_MS)
            continue; // henüz erken
        try {
            const res = await fetch(`${yenilemeUclari[platform]}${mevcut.access_token}`);
            if (!res.ok)
                throw new Error(`${res.status} ${await res.text()}`);
            const veri = (await res.json());
            const yeni = {
                access_token: veri.access_token,
                expires_at: now + veri.expires_in * 1000,
                ig_user_id: mevcut.ig_user_id,
            };
            await env.METRIKLER.put(metaTokenAnahtari(platform), JSON.stringify(yeni));
            console.log(`[meta-token] ${platform} yenilendi`);
        }
        catch (err) {
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
async function bildirimGonder(request, env) {
    let gövde;
    try {
        gövde = await request.json();
    }
    catch {
        return new Response("geçersiz istek", { status: 400, headers: corsHeaders() });
    }
    // Honeypot: gizli alan doluysa sessizce "başarılı" dön, bot'u oyalama.
    if (gövde.web_sitesi) {
        return new Response("ok", { status: 200, headers: corsHeaders() });
    }
    const mesaj = (gövde.mesaj ?? "").trim().slice(0, 2000);
    const eposta = (gövde.eposta ?? "").trim().slice(0, 200);
    const sayfaUrl = (gövde.sayfaUrl ?? "").trim().slice(0, 300);
    if (!mesaj || mesaj.length < 10) {
        return new Response("mesaj çok kısa", { status: 400, headers: corsHeaders() });
    }
    await sendAdminMessage(env, `📩 <b>Düzeltme/kaldırma talebi</b>\n` +
        (sayfaUrl ? `Sayfa: ${escapeHtml(sayfaUrl)}\n` : "") +
        (eposta ? `E-posta: ${escapeHtml(eposta)}\n` : "(e-posta verilmemiş)\n") +
        `\n${escapeHtml(mesaj)}`);
    return new Response("ok", { status: 200, headers: corsHeaders() });
}
function editMessage(env, chatId, messageId, text) {
    return tgCall(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [] },
    });
}
/** Video mesajlarında metin değil açıklama (caption) düzenlenir — editMessageText hata verir. */
function editCaption(env, chatId, messageId, caption) {
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
const ZAMANLAMA = [
    { workflow: "pipeline.yml", saatler: "hepsi" },
    // Dağıtım kuyruğu: başarısız paylaşımları tekrar dener, eski içerikleri saatte bir paylaşır.
    { workflow: "dagitim.yml", saatler: "hepsi" },
    // Gözetim ajanı sağlık denetimi (06 UTC = TR 09:00 çalışması günlük tam rapor).
    { workflow: "saglik-denetimi.yml", saatler: [0, 6, 12, 18] },
    { workflow: "burc.yml", saatler: [2] }, // TR 05:00 — insanlar uyanmadan
    { workflow: "daily-report.yml", saatler: [6] }, // TR 09:00
    { workflow: "weekly-analytics.yml", saatler: [5], sadecePazartesi: true },
];
async function workflowBaslat(env, workflow, inputs) {
    const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${workflow}/dispatches`, {
        method: "POST",
        headers: { ...ghHeaders(env), "Content-Type": "application/json" },
        body: JSON.stringify(inputs ? { ref: "main", inputs } : { ref: "main" }),
    });
    if (!res.ok)
        throw new Error(`${workflow} başlatılamadı: ${res.status} ${await res.text()}`);
}
async function zamanlanmisCalisma(env, zaman) {
    await metaTokenlariYenile(env).catch((err) => console.error("[meta-token] yenileme döngüsü hata:", err));
    const saat = zaman.getUTCHours();
    const pazartesi = zaman.getUTCDay() === 1;
    const baslatilacaklar = ZAMANLAMA.filter((z) => (z.saatler === "hepsi" || z.saatler.includes(saat)) && (!z.sadecePazartesi || pazartesi)).map((z) => z.workflow);
    console.log(`[cron] saat ${saat}, başlatılacaklar: ${JSON.stringify(baslatilacaklar)}`);
    const hatalar = [];
    for (const workflow of baslatilacaklar) {
        try {
            await workflowBaslat(env, workflow);
            console.log(`[cron] ${workflow} başlatıldı`);
        }
        catch (err) {
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
export default {
    async scheduled(event, env, ctx) {
        ctx.waitUntil(zamanlanmisCalisma(env, new Date(event.scheduledTime)));
    },
    async fetch(request, env) {
        const url = new URL(request.url);
        if (url.pathname === "/bildir") {
            if (request.method === "OPTIONS")
                return new Response(null, { headers: corsHeaders() });
            if (request.method === "POST")
                return bildirimGonder(request, env);
            return new Response("method not allowed", { status: 405, headers: corsHeaders() });
        }
        if (url.pathname === "/tepki") {
            if (request.method === "OPTIONS")
                return new Response(null, { headers: corsHeaders() });
            if (request.method === "POST")
                return tepkiVer(request, env);
            return new Response("method not allowed", { status: 405, headers: corsHeaders() });
        }
        if (url.pathname === "/meta-token") {
            if (request.method === "GET")
                return metaTokenGetir(request, env);
            if (request.method === "POST")
                return metaTokenYaz(request, env);
            return new Response("method not allowed", { status: 405 });
        }
        if (url.pathname === "/tepki-sonuc") {
            if (request.method === "OPTIONS")
                return new Response(null, { headers: corsHeaders() });
            if (request.method === "GET")
                return tepkiSonucGetir(request, env);
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
            if (url.searchParams.get("anahtar") !== env.TETIKLE_ANAHTARI) {
                return new Response("forbidden", { status: 403 });
            }
            const zaman = new Date();
            console.log(`[tetikle] çağrıldı, UTC saat: ${zaman.getUTCHours()}`);
            await zamanlanmisCalisma(env, zaman);
            return new Response("ok");
        }
        if (request.method !== "POST")
            return new Response("ok");
        const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
        if (secret !== env.TELEGRAM_WEBHOOK_SECRET)
            return new Response("forbidden", { status: 403 });
        const update = (await request.json());
        const cq = update.callback_query;
        if (!cq || !cq.message)
            return new Response("ok");
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
                await editCaption(env, chatId, mesajId, `✅ <b>Onaylandı</b> — Reels hazırlanıp paylaşılıyor (~5 dk), bitince haber gelecek.\n${slug}`);
            }
            catch (err) {
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
                }
                catch (err) {
                    console.error(err);
                    dagitimNotu = "⚠️ Dağıtım hemen başlatılamadı; saatlik kuyruk paylaşacak.";
                }
                await editMessage(env, cq.message.chat.id, cq.message.message_id, `✅ <b>Yayınlandı</b> — ${slug}
${dagitimNotu}`);
            }
            else {
                await rejectPost(env, slug);
                await editMessage(env, cq.message.chat.id, cq.message.message_id, `❌ <b>Yayınlanmadı</b> (silindi) — ${slug}`);
            }
        }
        catch (err) {
            console.error(err);
            const mesaj = err instanceof Error ? err.message : String(err);
            await editMessage(env, cq.message.chat.id, cq.message.message_id, `⚠️ <b>Hata oluştu</b>\n${mesaj.slice(0, 300)}\n\nGitHub'ı elle kontrol edin, işlem tamamlanmamış olabilir.`);
        }
        return new Response("ok");
    },
};
