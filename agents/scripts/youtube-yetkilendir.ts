/**
 * YouTube Shorts yüklemesi için bir kerelik OAuth kurulumu (bkz. src/lib/youtube.ts).
 *
 * Ön koşul (Google Cloud Console, YOUTUBE_API_KEY'in olduğu proje):
 *   1. "YouTube Data API v3" etkin olmalı.
 *   2. OAuth izin ekranı: "External", yayın durumu "In production"
 *      ("Testing" modunda refresh token 7 günde geçersiz olur).
 *   3. Kimlik bilgisi → OAuth client ID → Uygulama türü: "Desktop app".
 *
 * Kullanım (yerelde):
 *   YOUTUBE_OAUTH_CLIENT_ID=... YOUTUBE_OAUTH_CLIENT_SECRET=... npm run youtube-yetkilendir
 * Tarayıcıda sosyektif YouTube kanalının Google hesabıyla onay verilir; çıkan
 * refresh token GitHub Secrets'a YOUTUBE_REFRESH_TOKEN olarak eklenir
 * (client id/secret da YOUTUBE_OAUTH_CLIENT_ID / YOUTUBE_OAUTH_CLIENT_SECRET olarak).
 */
import { createServer } from "node:http";
import { YOUTUBE_KAPSAMLARI } from "../src/lib/youtube.js";

const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID;
const clientSecret = process.env.YOUTUBE_OAUTH_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error("YOUTUBE_OAUTH_CLIENT_ID ve YOUTUBE_OAUTH_CLIENT_SECRET ortam değişkenleri gerekli.");
  process.exit(1);
}

const PORT = 53682;
const redirectUri = `http://127.0.0.1:${PORT}/`;
const onayUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: YOUTUBE_KAPSAMLARI.join(" "),
    access_type: "offline",
    prompt: "consent",
  });

const sunucu = createServer(async (req, res) => {
  const kod = new URL(req.url ?? "/", redirectUri).searchParams.get("code");
  if (!kod) {
    res.writeHead(400).end("Kod yok.");
    return;
  }
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code: kod, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  const veri = (await tokenRes.json()) as { refresh_token?: string; error_description?: string };
  if (!veri.refresh_token) {
    res.writeHead(500).end("Refresh token alınamadı — konsola bak.");
    console.error("Hata:", veri);
  } else {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" }).end("Tamam, bu sekmeyi kapatabilirsin.");
    console.log("\nYOUTUBE_REFRESH_TOKEN=" + veri.refresh_token + "\n");
    console.log("Bu değeri GitHub Secrets'a ekle: gh secret set YOUTUBE_REFRESH_TOKEN");
  }
  sunucu.close();
});

sunucu.listen(PORT, "127.0.0.1", () => {
  console.log("Tarayıcıda şu adresi aç ve sosyektif YouTube kanalının hesabıyla onay ver:\n\n" + onayUrl + "\n");
});
