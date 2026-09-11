/**
 * Cloudflare dashboard "Quick Edit" için düz JS derlemesi.
 * Kaynak/yorumlu sürüm: src/index.ts (mantık birebir aynı).
 * Bu dosyayı Workers & Pages > sosyektif-telegram-onay > Edit Code alanına
 * olduğu gibi yapıştırıp Deploy'a bas.
 */

const POSTS_DIR = "site/src/content/posts";

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

// agents/src/lib/telegram.ts -> onayKisaId ile birebir aynı algoritma.
async function kisaId(slug) {
  const veri = new TextEncoder().encode(slug);
  const ozet = await crypto.subtle.digest("SHA-256", veri);
  const hex = [...new Uint8Array(ozet)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex.slice(0, 12);
}

// Telegram callback_data 64 bayt sınırı yüzünden mesajlarda slug yerine
// kısa hash gönderiliyor; burada taslak klasörü listelenip aynı hash'i
// üreten dosya bulunarak gerçek slug'a geri dönülüyor.
async function resolveSlug(env, id) {
  const res = await fetch(
    `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${encodeURIComponent(POSTS_DIR)}`,
    { headers: ghHeaders(env) }
  );
  if (!res.ok) throw new Error(`GitHub GET ${POSTS_DIR} başarısız: ${res.status} ${await res.text()}`);
  const girdiler = await res.json();
  for (const girdi of girdiler) {
    if (!girdi.name.endsWith(".md")) continue;
    const aday = girdi.name.slice(0, -3);
    if ((await kisaId(aday)) === id) return aday;
  }
  throw new Error(`"${id}" hash'ine karşılık gelen taslak bulunamadı.`);
}

async function getFile(env, path) {
  const res = await fetch(
    `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${encodeURIComponent(path)}`,
    { headers: ghHeaders(env) }
  );
  if (!res.ok) throw new Error(`GitHub GET ${path} başarısız: ${res.status} ${await res.text()}`);
  const veri = await res.json();
  return { sha: veri.sha, content: b64DecodeUnicode(veri.content) };
}

async function approvePost(env, slug) {
  const path = `${POSTS_DIR}/${slug}.md`;
  const { sha, content } = await getFile(env, path);
  if (!/taslak:\s*true/.test(content)) {
    throw new Error(`"${slug}" dosyasında "taslak: true" bulunamadı (zaten onaylanmış olabilir).`);
  }
  const yeniIcerik = content.replace(/taslak:\s*true/, "taslak: false");
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
}

async function rejectPost(env, slug) {
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

async function tgCall(env, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.error(`[tg] ${method} başarısız:`, res.status, await res.text());
}

function answerCallback(env, callbackQueryId, text) {
  return tgCall(env, "answerCallbackQuery", { callback_query_id: callbackQueryId, text, show_alert: false });
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

export default {
  async fetch(request, env) {
    if (request.method !== "POST") return new Response("ok");

    const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (secret !== env.TELEGRAM_WEBHOOK_SECRET) return new Response("forbidden", { status: 403 });

    const update = await request.json();
    const cq = update.callback_query;
    if (!cq || !cq.message) return new Response("ok");

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
