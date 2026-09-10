import { optionalEnv } from "./env.js";

function botToken(): string | undefined {
  return optionalEnv("TELEGRAM_BOT_TOKEN");
}

async function sendMessage(chatId: string, text: string, extra?: Record<string, unknown>) {
  const token = botToken();
  if (!token) {
    console.warn("[telegram] TELEGRAM_BOT_TOKEN yok, mesaj gönderilmedi:", text);
    return;
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: false,
      ...extra,
    }),
  });

  if (!res.ok) {
    console.error("[telegram] gönderim başarısız:", res.status, await res.text());
  }
}

/** Yöneticiye (özel onay/uyarı sohbeti) mesaj gönderir. */
export async function notifyAdmin(text: string): Promise<void> {
  const chatId = optionalEnv("TELEGRAM_ADMIN_CHAT_ID");
  if (!chatId) {
    console.warn("[telegram] TELEGRAM_ADMIN_CHAT_ID yok, admin bildirimi atlandı");
    return;
  }
  await sendMessage(chatId, text);
}

/** Herkese açık kanala yeni içerik duyurusu gönderir (Dağıtım Ajanı). */
export async function postToPublicChannel(text: string): Promise<void> {
  const chatId = optionalEnv("TELEGRAM_PUBLIC_CHANNEL_ID");
  if (!chatId) {
    console.warn("[telegram] TELEGRAM_PUBLIC_CHANNEL_ID yok, kanal paylaşımı atlandı");
    return;
  }
  await sendMessage(chatId, text);
}

export function isTelegramConfigured(): boolean {
  return botToken() !== undefined;
}
