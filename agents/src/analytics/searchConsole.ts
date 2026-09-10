import { createSign } from "node:crypto";
import { optionalEnv } from "../lib/env.js";

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

interface SearchAnalyticsRow {
  keys: string[]; // [page]
  clicks: number;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Servis hesabı JSON'undan JWT imzalayıp OAuth2 access token alır (googleapis paketi olmadan, minimal). */
async function getAccessToken(sa: ServiceAccountKey): Promise<string> {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const claims = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/webmasters.readonly",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    })
  );

  const signInput = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signInput);
  const signature = base64url(signer.sign(sa.private_key));
  const jwt = `${signInput}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) throw new Error(`oauth token alınamadı: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

/** Search Console'dan son 7 günün sayfa bazlı tıklama verisini çeker. */
export async function fetchSearchConsoleClicksByPath(): Promise<Record<string, number>> {
  const rawCreds = optionalEnv("GOOGLE_SEARCH_CONSOLE_CREDENTIALS_JSON");
  if (!rawCreds) {
    console.warn("[analytics/search-console] kimlik bilgisi yok, atlanıyor");
    return {};
  }

  try {
    const sa = JSON.parse(rawCreds) as ServiceAccountKey;
    const accessToken = await getAccessToken(sa);

    const simdi = new Date();
    const yediGunOnce = new Date(simdi.getTime() - 7 * 24 * 60 * 60 * 1000);
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    const res = await fetch(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
        "https://sosyektif.com/"
      )}/searchAnalytics/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate: iso(yediGunOnce),
          endDate: iso(simdi),
          dimensions: ["page"],
          rowLimit: 500,
        }),
      }
    );

    if (!res.ok) {
      console.warn(`[analytics/search-console] ${res.status}: ${await res.text()}`);
      return {};
    }

    const data = (await res.json()) as { rows?: SearchAnalyticsRow[] };
    const sonuc: Record<string, number> = {};
    for (const row of data.rows ?? []) {
      const yol = new URL(row.keys[0] ?? "").pathname.replace(/^\/|\/$/g, "");
      sonuc[yol] = (sonuc[yol] ?? 0) + row.clicks;
    }
    return sonuc;
  } catch (err) {
    console.warn("[analytics/search-console] hata:", err instanceof Error ? err.message : err);
    return {};
  }
}
