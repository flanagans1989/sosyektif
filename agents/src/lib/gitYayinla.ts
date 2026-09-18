/**
 * Instagram gibi "görseli URL'den çeken" platformlar için kritik bir sorunu
 * çözer (PLAN.md Bölüm 11.2 — 2026-09-13'te gerçek paylaşımlarda "görsel
 * çıkmıyor" şikayetiyle keşfedildi):
 *
 * Üretilen carousel görselleri normalde pipeline'ın SONUNDA, GitHub Actions
 * workflow'unun ayrı bir adımında commit'lenip push'lanıyor (bkz.
 * .github/workflows/pipeline.yml). Instagram'a paylaşım ise pipeline
 * SIRASINDA, daha commit/push/Cloudflare Pages build'i hiç olmadan yapılıyor
 * — yani Instagram'ın çektiği https://sosyektif.com/images/social/... URL'i
 * o an için var olmuyor, paylaşım görselsiz/kırık gidiyor.
 *
 * Çözüm: bu dosyaların commit+push'unu hemen burada (senkron, Instagram
 * çağrısından ÖNCE) yap, sonra URL gerçekten canlıya çıkana kadar (Cloudflare
 * Pages build'i bitene kadar) kısa aralıklarla yokla. Zaman aşımında sessizce
 * vazgeç (R5 deseni) — kırık görselli paylaşımdan iyidir.
 */
import { execFileSync } from "node:child_process";

const GIT_KULLANICI_ADI = "sosyektif-bot";
const GIT_KULLANICI_EPOSTA = "41898282+github-actions[bot]@users.noreply.github.com";

function git(args: string[]): void {
  execFileSync("git", args, { stdio: "pipe" });
}

/**
 * Verilen dosyaları hemen commit'leyip push'lar. GitHub Actions'ta
 * `actions/checkout` push yetkisini zaten bırakıyor (persist-credentials),
 * yerelde/testte gerçek bir push yapmamak için önce `GITHUB_ACTIONS` ortam
 * değişkenini kontrol et.
 */
export function dosyalariHemenYayinla(dosyalar: string[], commitMesaji: string): boolean {
  if (!process.env.GITHUB_ACTIONS) {
    console.warn("[git-yayinla] GitHub Actions dışında, gerçek commit/push atlanıyor");
    return false;
  }
  try {
    git(["config", "user.name", GIT_KULLANICI_ADI]);
    git(["config", "user.email", GIT_KULLANICI_EPOSTA]);
    git(["add", ...dosyalar]);
    // Değişiklik yoksa (ör. aynı görsel zaten commit'liyse) commit'i atla.
    try {
      execFileSync("git", ["diff", "--cached", "--quiet"], { stdio: "pipe" });
      console.log("[git-yayinla] değişiklik yok, commit atlanıyor");
      return true;
    } catch {
      // diff --quiet farklıysa exit code 1 verir — bu normal, commit'e devam.
    }
    git(["commit", "-m", commitMesaji]);
    // Aynı anda Telegram onay worker'ı da main'e push etmiş olabilir.
    // --autostash şart: pipeline sırasında çalışma alanında henüz commit'lenmemiş
    // başka değişiklikler (yeni içerik, data/*.json) oluyor ve düz
    // "pull --rebase" bunlar yüzünden reddediliyordu ("You have unstaged
    // changes") — Instagram/Facebook paylaşımı bu yüzden her seferinde iptal
    // oluyordu (2026-09-13'te pipeline loglarında tespit edildi).
    git(["pull", "--rebase", "--autostash", "origin", "main"]);
    git(["push"]);
    return true;
  } catch (err) {
    console.error("[git-yayinla] commit/push başarısız:", err);
    // Çakışan bir rebase yarıda kalırsa sonraki tüm git çağrıları ("rebase in
    // progress") başarısız olur; çalışma alanını temiz duruma döndür. Yerel
    // commit kalır, bir sonraki çağrı yeniden pull --rebase + push dener.
    try {
      git(["rebase", "--abort"]);
    } catch {
      // yarıda kalan rebase yoktu — normal
    }
    return false;
  }
}

/**
 * URL'ler gerçekten canlıya çıkana (200 dönene) kadar kısa aralıklarla
 * yoklar. Cloudflare Pages build süresi değişken olduğu için makul bir
 * zaman aşımı (varsayılan 3 dakika) sonunda pes eder.
 */
export async function canliyaCikanaKadarBekle(
  urls: string[],
  { timeoutMs = 180_000, araliklMs = 5_000 }: { timeoutMs?: number; araliklMs?: number } = {}
): Promise<boolean> {
  const baslangic = Date.now();
  while (Date.now() - baslangic < timeoutMs) {
    try {
      const sonuclar = await Promise.all(
        urls.map((url) => fetch(url, { method: "HEAD", signal: AbortSignal.timeout(10_000) }).then((res) => res.ok))
      );
      if (sonuclar.every(Boolean)) return true;
    } catch {
      // ağ hatası — bir sonraki denemede tekrar dene
    }
    await new Promise((resolve) => setTimeout(resolve, araliklMs));
  }
  return false;
}
