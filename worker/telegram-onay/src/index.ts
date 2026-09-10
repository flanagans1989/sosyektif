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
}

const POSTS_DIR = "site/src/content/posts";

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
  const res = await fetch(
    `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${encodeURIComponent(POSTS_DIR)}`,
    { headers: ghHeaders(env) }
  );
  if (!res.ok) throw new Error(`GitHub GET ${POSTS_DIR} başarısız: ${res.status} ${await res.text()}`);
  const girdiler = (await res.json()) as { name: string }[];
  for (const girdi of girdiler) {
    if (!girdi.name.endsWith(".md")) continue;
    const aday = girdi.name.slice(0, -3);
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

function editMessage(env: Env, chatId: number, messageId: number, text: string): Promise<void> {
  return tgCall(env, "editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [] },
  });
}

interface TelegramCallbackQuery {
  id: string;
  data?: string;
  message?: { chat: { id: number }; message_id: number };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") return new Response("ok");

    const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (secret !== env.TELEGRAM_WEBHOOK_SECRET) return new Response("forbidden", { status: 403 });

    const update = (await request.json()) as { callback_query?: TelegramCallbackQuery };
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

    try {
      const slug = await resolveSlug(env, id);
      if (aksiyon === "approve") {
        await approvePost(env, slug);
        await answerCallback(env, cq.id, "✅ Yayınlandı!");
        await editMessage(env, cq.message.chat.id, cq.message.message_id, `✅ <b>Yayınlandı</b> — ${slug}`);
      } else {
        await rejectPost(env, slug);
        await answerCallback(env, cq.id, "🗑️ Reddedildi ve silindi.");
        await editMessage(env, cq.message.chat.id, cq.message.message_id, `❌ <b>Yayınlanmadı</b> (silindi) — ${slug}`);
      }
    } catch (err) {
      console.error(err);
      await answerCallback(env, cq.id, "Hata oluştu (log'a bak).");
    }

    return new Response("ok");
  },
};
