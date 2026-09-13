import { createHash } from "node:crypto";
import { optionalEnv } from "./env.js";

/**
 * Telegram callback_data alanı en fazla 64 bayt kabul eder; slug'lar bunu
 * kolayca aşıyor (bkz. Keykubad örneği). Bunun yerine slug'ın kısa bir
 * hash'i gönderilir; worker (worker/telegram-onay) GitHub'daki taslak
 * klasörünü listeleyip aynı hash'i üreten dosyayı bularak gerçek slug'a
 * geri döner.
 */
export function onayKisaId(slug: string): string {
  return createHash("sha256").update(slug).digest("hex").slice(0, 12);
}

/** parse_mode=HTML ile gönderilen mesajlarda kullanıcı/LLM metnini güvenli hale getirir. */
export function escapeHtml(metin: string): string {
  return metin.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

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

/**
 * Yöneticiye, altında "✅ Yayınla" / "❌ Yayınlama" inline butonları olan bir
 * onay mesajı gönderir. Butona basıldığında Telegram, kurulu webhook'a
 * (bkz. worker/telegram-onay) bir callback_query yollar; o da GitHub'daki
 * taslak dosyasını commit ile günceller/siler. Böylece onay için GitHub'a
 * gidip dosya düzenlemeye gerek kalmaz.
 */
export async function notifyAdminOnayButonlu(text: string, slug: string): Promise<void> {
  const chatId = optionalEnv("TELEGRAM_ADMIN_CHAT_ID");
  if (!chatId) {
    console.warn("[telegram] TELEGRAM_ADMIN_CHAT_ID yok, admin bildirimi atlandı");
    return;
  }
  const id = onayKisaId(slug);
  await sendMessage(chatId, text, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✅ Yayınla", callback_data: `approve:${id}` },
          { text: "❌ Yayınlama", callback_data: `reject:${id}` },
        ],
      ],
    },
  });
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

/**
 * Yöneticiye video gönderir (ör. Reels önizlemesi, bkz. scripts/reel-onizle-telegram.ts).
 * Kullanıcı "dışarıdayken de Telegram'dan izleyip karar versem" dediği için
 * eklendi — reel-onizle script'i dosyayı bilgisayara yazıyordu, bu ise
 * doğrudan telefona (Telegram) gönderiyor. Telegram bot API'si video için
 * multipart/form-data bekliyor, JSON değil (sendMessage'dan farklı).
 */
export async function sendVideoToAdmin(
  video: Buffer,
  caption: string,
  secenekler: {
    /** Verilirse videonun altına "✅ Paylaş / ❌ Paylaşma" butonları eklenir (bkz. worker reel_ok/reel_no). */
    onaySlug?: string;
    genislik?: number;
    yukseklik?: number;
    sureSn?: number;
  } = {}
): Promise<void> {
  const token = botToken();
  const chatId = optionalEnv("TELEGRAM_ADMIN_CHAT_ID");
  if (!token || !chatId) {
    console.warn("[telegram] TELEGRAM_BOT_TOKEN/TELEGRAM_ADMIN_CHAT_ID yok, video gönderilmedi");
    return;
  }

  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("caption", caption);
  form.append("parse_mode", "HTML");
  // Boyut verilmezse Telegram dikey videoyu kare/yanlış oranlı önizleme ile gösteriyor.
  if (secenekler.genislik) form.append("width", String(secenekler.genislik));
  if (secenekler.yukseklik) form.append("height", String(secenekler.yukseklik));
  if (secenekler.sureSn) form.append("duration", String(Math.round(secenekler.sureSn)));
  form.append("supports_streaming", "true");
  if (secenekler.onaySlug) {
    const id = onayKisaId(secenekler.onaySlug);
    form.append(
      "reply_markup",
      JSON.stringify({
        inline_keyboard: [
          [
            { text: "✅ Reels olarak paylaş", callback_data: `reel_ok:${id}` },
            { text: "❌ Paylaşma", callback_data: `reel_no:${id}` },
          ],
        ],
      })
    );
  }
  form.append("video", new Blob([video], { type: "video/mp4" }), "reel.mp4");

  const res = await fetch(`https://api.telegram.org/bot${token}/sendVideo`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    console.error("[telegram] video gönderimi başarısız:", res.status, await res.text());
  }
}

export function isTelegramConfigured(): boolean {
  return botToken() !== undefined;
}
