/**
 * Cloudflare dashboard "Quick Edit" için düz JS derlemesi.
 * Kaynak/yorumlu sürüm: src/index.ts (mantık birebir aynı, `npx tsc` ile
 * tipleri soyulmuş hali). Bu dosyayı Workers & Pages > sosyektif-telegram-onay
 * (deraks-rental.workers.dev alt alan adındaki Cloudflare hesabı) >
 * Edit Code alanına olduğu gibi yapıştırıp Deploy'a bas.
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
    { workflow: "burc.yml", saatler: [2] }, // TR 05:00 — insanlar uyanmadan
    { workflow: "daily-report.yml", saatler: [6] }, // TR 09:00
    { workflow: "weekly-analytics.yml", saatler: [5], sadecePazartesi: true },
];
async function workflowBaslat(env, workflow) {
    const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${workflow}/dispatches`, {
        method: "POST",
        headers: { ...ghHeaders(env), "Content-Type": "application/json" },
        body: JSON.stringify({ ref: "main" }),
    });
    if (!res.ok)
        throw new Error(`${workflow} başlatılamadı: ${res.status} ${await res.text()}`);
}
async function zamanlanmisCalisma(env, zaman) {
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
        if (!id || (aksiyon !== "approve" && aksiyon !== "reject")) {
            await answerCallback(env, cq.id, "Geçersiz istek.");
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
                await editMessage(env, cq.message.chat.id, cq.message.message_id, `✅ <b>Yayınlandı</b> — ${slug}`);
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
