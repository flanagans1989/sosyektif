/**
 * Gözetim ajanı — sistem sağlık denetimi (PLAN.md Bölüm 11.8).
 *
 * Kullanıcı: "Gözetim ajanına sistemin tam olarak çalışma sağlığını da
 * devredelim, arada bir tarasın, audit yapsın, çalışmayan ne varsa düzeltsin."
 *
 * 6 saatte bir çalışır (.github/workflows/saglik-denetimi.yml). Her şeyi
 * dışarıdan ölçer (bkz. saglik/kontroller.ts), bilinen arıza türlerini
 * kendisi onarır:
 *   - başarısız workflow'u bir kez yeniden başlatır,
 *   - zamanlayıcı durmuşsa pipeline'ı elle tetikler,
 *   - kanal düzelince vazgeçilmiş paylaşımları dağıtım kuyruğuna geri alır,
 *   - paylaşım bekleyen içerik varsa dağıtım kuyruğunu tetikler.
 * Kod hatası gibi kendi başına düzeltemeyeceklerini ne yapılması gerektiğiyle
 * birlikte Telegram'a yazar.
 *
 * Aynı sorunu 6 saatte bir tekrar bildirmez: data/saglik.json'da önceki
 * denetimi tutar; yalnızca YENİ çıkan, ÇÖZÜLEN ya da ONARILAN sorunlar
 * bildirilir. `--tam-rapor` ile (günlük rapor) tüm açık sorunlar listelenir.
 *
 * Kullanım: npm run saglik-denetimi [-- --tam-rapor] [-- --onarma]
 */
import { appendFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DATA_DIR } from "../lib/paths.js";
import { optionalEnv } from "../lib/env.js";
import { escapeHtml, notifyAdmin } from "../lib/telegram.js";
import { dosyalariHemenYayinla } from "../lib/gitYayinla.js";
import { readConfig, writeConfig } from "../lib/state.js";
import { PATHS } from "../lib/paths.js";
import {
  anahtarKontrolleri,
  dagitimKontrolleri,
  githubKontrolleri,
  kanalKontrolleri,
  siteKontrolleri,
  veriKontrolleri,
  type KontrolSonucu,
} from "../saglik/kontroller.js";

const SAGLIK_DOSYASI = path.join(DATA_DIR, "saglik.json");

interface KayitliSorun {
  alan: string;
  durum: "uyari" | "hata";
  detay: string;
  cozum?: string;
  ilkGorulme: string;
}
interface SaglikKaydi {
  sonDenetim: string;
  toplamKontrol: number;
  sorunlar: Record<string, KayitliSorun>;
}

async function oncekiKayit(): Promise<SaglikKaydi | null> {
  try {
    return JSON.parse(await readFile(SAGLIK_DOSYASI, "utf-8")) as SaglikKaydi;
  } catch {
    return null;
  }
}

function satir(k: KontrolSonucu): string {
  const isaret = k.durum === "hata" ? "❌" : "⚠️";
  let s = `${isaret} <b>${escapeHtml(k.alan)}</b>: ${escapeHtml(k.detay)}`;
  if (k.onarim) s += `\n   🔧 ${escapeHtml(k.onarim)}`;
  else if (k.cozum) s += `\n   👉 ${escapeHtml(k.cozum)}`;
  return s;
}

async function dagitimiTetikle(): Promise<string> {
  const repo = optionalEnv("GITHUB_REPOSITORY");
  const token = optionalEnv("GITHUB_TOKEN");
  if (!repo || !token) return "GITHUB_TOKEN yok";
  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/dagitim.yml/dispatches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
    body: JSON.stringify({ ref: "main" }),
  });
  return res.ok ? "Dağıtım kuyruğu başlatıldı." : `Dağıtım başlatılamadı: ${res.status}`;
}

async function main(): Promise<void> {
  // TR 09:00 (UTC 06) çalışması günlük tam rapordur.
  const tamRapor = process.argv.includes("--tam-rapor") || Boolean(optionalEnv("TAM_RAPOR")) || new Date().getUTCHours() === 6;
  const onarimYap = !process.argv.includes("--onarma");

  const { sonuclar: kanalSonuclari, saglik } = await kanalKontrolleri();
  const gruplar = await Promise.all([
    siteKontrolleri(),
    veriKontrolleri(),
    githubKontrolleri(onarimYap),
    anahtarKontrolleri(),
  ]);
  const { sonuclar: dagitimSonuclari, bekleyenVar } = await dagitimKontrolleri(saglik, onarimYap);
  const tum: KontrolSonucu[] = [...gruplar.flat(), ...kanalSonuclari, ...dagitimSonuclari];

  // Çalışan bir kanalda paylaşım bekleyen içerik varsa kuyruğu dürt (saatlik
  // zamanlayıcı gecikmişse bile ilerlesin). Rutin olduğu için bildirim üretmez.
  if (onarimYap && bekleyenVar) {
    const sonuc = await dagitimiTetikle();
    tum.push({ id: "dagitim-tetik", alan: "Dağıtım", durum: "ok", detay: `Paylaşım bekleyen içerik var — ${sonuc}` });
  }

  const onceki = await oncekiKayit();
  const oncekiSorunlar = onceki?.sorunlar ?? {};

  // Otomatik duraklatma onarımı: pipeline "ardışık başarısız çalışma" yüzünden
  // kendini kilitlediyse (geçici LLM kotası/kaynak sorunu) ve kilit 6 saattir
  // sürüyorsa, yapay zekâ anahtarları şu an çalışıyorsa kilidi bir kez aç.
  // Elle konmuş duraklatmalara (başka sebep) dokunulmaz.
  const duraklatma = tum.find((k) => k.id === "pipeline-duraklatildi");
  if (onarimYap && duraklatma) {
    const config = await readConfig();
    const ilk = oncekiSorunlar["pipeline-duraklatildi"]?.ilkGorulme;
    const altiSaat = ilk ? Date.now() - new Date(ilk).getTime() > 6 * 60 * 60 * 1000 : false;
    const llmCalisiyor = tum.some((k) => k.id.startsWith("llm-") && k.durum === "ok");
    if (config.paused && /ardışık başarısız/.test(config.pausedReason ?? "") && altiSaat && llmCalisiyor) {
      config.paused = false;
      config.pausedReason = undefined;
      config.ardisikBasarisizCalisma = 0;
      await writeConfig(config);
      duraklatma.onarim = dosyalariHemenYayinla([PATHS.config], "Sağlık denetimi: otomatik duraklatma kaldırıldı")
        ? "Yapay zekâ anahtarları çalıştığı için duraklatma kaldırıldı; pipeline tekrar deneyecek."
        : "Duraklatma kaldırılamadı (push başarısız).";
      if (duraklatma.onarim.startsWith("Yapay")) duraklatma.durum = "ok";
    }
  }

  const sorunlar = tum.filter((k) => k.durum !== "ok");
  const onarilanlar = tum.filter((k) => k.onarim);

  const yeni = sorunlar.filter((k) => !oncekiSorunlar[k.id]);
  const cozulen = Object.entries(oncekiSorunlar).filter(([id]) => !sorunlar.some((k) => k.id === id));
  const simdi = new Date().toISOString();

  const kayit: SaglikKaydi = {
    sonDenetim: simdi,
    toplamKontrol: tum.length,
    sorunlar: Object.fromEntries(
      sorunlar.map((k) => [
        k.id,
        {
          alan: k.alan,
          durum: k.durum as "uyari" | "hata",
          detay: k.detay,
          ...(k.cozum ? { cozum: k.cozum } : {}),
          ilkGorulme: oncekiSorunlar[k.id]?.ilkGorulme ?? simdi,
        },
      ])
    ),
  };
  await writeFile(SAGLIK_DOSYASI, JSON.stringify(kayit, null, 2) + "\n", "utf-8");
  dosyalariHemenYayinla([SAGLIK_DOSYASI], "Sağlık denetimi sonucu");

  // Konsol + GitHub iş özeti (her zaman tam liste).
  const hataSayisi = sorunlar.filter((k) => k.durum === "hata").length;
  const uyariSayisi = sorunlar.length - hataSayisi;
  const ozet = `${tum.length} kontrol · ${hataSayisi} hata · ${uyariSayisi} uyarı · ${onarilanlar.length} otomatik onarım`;
  console.log(`[saglik] ${ozet}`);
  for (const k of tum) console.log(`  [${k.durum}] ${k.alan} — ${k.detay}${k.onarim ? ` → ${k.onarim}` : ""}`);
  const ozetDosyasi = optionalEnv("GITHUB_STEP_SUMMARY");
  if (ozetDosyasi) {
    const isaret = { ok: "✅", uyari: "⚠️", hata: "❌" } as const;
    await appendFile(
      ozetDosyasi,
      `## Sağlık denetimi\n${ozet}\n\n| | Alan | Detay | Onarım / Çözüm |\n|---|---|---|---|\n` +
        tum.map((k) => `| ${isaret[k.durum]} | ${k.alan} | ${k.detay.replace(/\|/g, "/")} | ${(k.onarim ?? k.cozum ?? "").replace(/\|/g, "/")} |`).join("\n") +
        "\n"
    );
  }

  // Telegram: yalnızca değişiklik varsa (ya da günlük tam raporda).
  const bildirilecekSorunlar = tamRapor ? sorunlar : yeni;
  const onarimSatirlari = onarilanlar.filter((k) => !bildirilecekSorunlar.includes(k));
  if (!tamRapor && bildirilecekSorunlar.length === 0 && cozulen.length === 0 && onarimSatirlari.length === 0) {
    console.log("[saglik] değişiklik yok, bildirim gönderilmedi");
    return;
  }

  const bolumler: string[] = [
    hataSayisi === 0 && uyariSayisi === 0
      ? `🩺 <b>Sağlık denetimi</b> — her şey çalışıyor (${tum.length} kontrol)`
      : `🩺 <b>Sağlık denetimi</b> — ${ozet}`,
  ];
  if (bildirilecekSorunlar.length) {
    const sirali = [...bildirilecekSorunlar].sort((a, b) => (a.durum === b.durum ? 0 : a.durum === "hata" ? -1 : 1));
    bolumler.push(`${tamRapor ? "Açık sorunlar" : "Yeni sorunlar"}:\n${sirali.map(satir).join("\n")}`);
  }
  if (onarimSatirlari.length) {
    bolumler.push(`Otomatik yapılanlar:\n${onarimSatirlari.map((k) => `🔧 ${escapeHtml(k.alan)}: ${escapeHtml(k.onarim ?? "")}`).join("\n")}`);
  }
  if (cozulen.length) {
    bolumler.push(`Çözülenler:\n${cozulen.map(([, s]) => `✅ ${escapeHtml(s.alan)}: ${escapeHtml(s.detay)}`).join("\n")}`);
  }
  await notifyAdmin(bolumler.join("\n\n").slice(0, 4000));
}

main()
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error("[saglik] denetim çöktü:", err);
    await notifyAdmin(`🩺❌ Sağlık denetiminin kendisi çöktü: ${escapeHtml(err instanceof Error ? err.message : String(err))}`).catch(() => {});
    process.exit(1);
  });
