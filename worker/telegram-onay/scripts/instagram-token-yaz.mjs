/**
 * Instagram token'ını yeniler: Meta dashboard'ından alınan yeni "Generate token"
 * değerini sorar, Instagram'a sorarak doğrular (hesap adı + kullanıcı ID'si),
 * Worker'ın KV'sine (meta_token:instagram) yazar.
 *
 * Kullanım (worker/telegram-onay klasöründe):  node scripts/instagram-token-yaz.mjs
 * Gereken: `npx wrangler whoami` ile giriş yapılmış olması. AGENT_PAYLASIM_ANAHTARI gerekmez.
 * Token ekrana yazdırılmaz, sohbete/komut geçmişine düşmez (yalnızca prompt'ta girilir).
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const METRIKLER_KV_ID = "fdb4338b9f094a2083dcb827207c2d80";
const GUN_MS = 24 * 60 * 60 * 1000;

/** Yazılanı ekrana basmadan satır okur. */
function gizliSor(soru) {
  return new Promise((coz) => {
    process.stdout.write(soru);
    let girdi = "";
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    const dinle = (ch) => {
      for (const c of ch) {
        if (c === "\r" || c === "\n" || c === "") {
          process.stdin.setRawMode?.(false);
          process.stdin.pause();
          process.stdin.off("data", dinle);
          process.stdout.write("\n");
          return coz(girdi.trim());
        }
        if (c === "") process.exit(130); // Ctrl+C
        if (c === "" || c === "\b") girdi = girdi.slice(0, -1);
        else girdi += c;
      }
    };
    process.stdin.on("data", dinle);
  });
}

async function main() {
  const token = process.env.IG_TOKEN || (await gizliSor("Yeni Instagram token'ını yapıştırıp Enter'a bas (ekranda görünmez): "));
  if (!token) {
    console.error("Token boş, çıkılıyor.");
    process.exitCode = 1;
    return;
  }

  // 1) Token'ı Instagram'a sorarak doğrula ve hesabı öğren.
  const me = await fetch(
    "https://graph.instagram.com/v21.0/me?" + new URLSearchParams({ fields: "user_id,username", access_token: token }),
    { signal: AbortSignal.timeout(20_000) }
  );
  const meGovde = await me.json().catch(() => ({}));
  if (!me.ok) {
    console.error("Token GEÇERSİZ, hiçbir şey yazılmadı. Instagram'ın cevabı:");
    console.error(JSON.stringify(meGovde.error ?? meGovde));
    process.exitCode = 1;
    return;
  }
  const igUserId = String(meGovde.user_id ?? meGovde.id ?? "");
  if (!igUserId) {
    console.error("Cevapta kullanıcı ID'si yok, hiçbir şey yazılmadı:", JSON.stringify(meGovde));
    process.exitCode = 1;
    return;
  }
  console.log(`✓ Token geçerli — hesap: @${meGovde.username}  (ID: ${igUserId})`);

  // 2) KV'ye yaz (Worker /meta-token GET'i ve agents bu kaydı okur).
  const kayit = { access_token: token, expires_at: Date.now() + 60 * GUN_MS, ig_user_id: igUserId };
  const dizin = mkdtempSync(path.join(tmpdir(), "igtoken-"));
  const dosya = path.join(dizin, "kayit.json");
  try {
    writeFileSync(dosya, JSON.stringify(kayit));
    const sonuc = spawnSync(
      "npx",
      ["wrangler", "kv:key", "put", "meta_token:instagram", "--path", dosya, "--namespace-id", METRIKLER_KV_ID],
      { stdio: ["ignore", "pipe", "pipe"], shell: true, encoding: "utf8" }
    );
    if (sonuc.status !== 0) {
      console.error("KV'ye yazılamadı:\n" + (sonuc.stderr || sonuc.stdout));
      process.exitCode = 1;
    return;
    }
  } finally {
    rmSync(dizin, { recursive: true, force: true });
  }
  console.log("✓ Token Worker KV'sine yazıldı (60 gün geçerli; Worker süresi azalınca kendisi yeniler).");
  console.log("Bitti. Bir sonraki saatlik dağıtımda bekleyen Instagram paylaşımları yeniden denenir.");

}

await main();
