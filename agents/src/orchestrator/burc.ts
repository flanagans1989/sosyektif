/**
 * Günlük + haftalık burç yorumu üretimi (.github/workflows/burc.yml).
 *
 * Günde birden fazla tetiklenebilir (Cloudflare zamanlayıcısı + GitHub'ın
 * kendi zamanlayıcısı). Bu yüzden idempotent: bugünün (Türkiye günü) yorumu
 * zaten varsa yeniden üretmez — aksi halde okurun sabah okuduğu yorum öğlen
 * değişirdi. Haftalık yorum yalnızca yeni hafta başladığında üretilir.
 *
 * Her ikisinde de 12 burcun tamamı TEK bir LLM çağrısında üretilir (12 ayrı
 * çağrı yerine — kota tasarrufu + tutarlı üslup). Çıktılar site/src/data
 * altına yazılır; Astro build zamanında doğrudan import eder.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { chatComplete } from "../lib/llmRouter.js";
import { parseJsonLoose } from "../lib/json.js";
import { notifyAdmin } from "../lib/telegram.js";
import { SITE_DIR } from "../lib/paths.js";
import { BURC_ANAHTARLARI, BURC_ISIMLERI, type BurcAnahtari } from "../lib/burclar.js";

const GUNLUK_YOL = path.join(SITE_DIR, "src", "data", "gunluk-burc.json");
const HAFTALIK_YOL = path.join(SITE_DIR, "src", "data", "haftalik-burc.json");
const TURKIYE_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC+3, sabit (2016'dan beri DST yok)

function turkiyeTarihi(tarih = new Date()): string {
  return new Date(tarih.getTime() + TURKIYE_OFFSET_MS).toISOString().slice(0, 10);
}

/** Verilen günün içinde bulunduğu haftanın Pazartesi'si (YYYY-MM-DD). */
function haftaBasi(gun: string): string {
  const d = new Date(`${gun}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

async function jsonOku(yol: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(yol, "utf-8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function jsonYaz(yol: string, veri: unknown): Promise<void> {
  await mkdir(path.dirname(yol), { recursive: true });
  await writeFile(yol, JSON.stringify(veri, null, 2) + "\n", "utf-8");
}

function burclarSemasi<T extends z.ZodTypeAny>(tek: T) {
  const sekil = Object.fromEntries(BURC_ANAHTARLARI.map((a) => [a, tek])) as Record<BurcAnahtari, T>;
  return z.object({ burclar: z.object(sekil) });
}

const gunlukSchema = burclarSemasi(
  z.object({
    yorum: z.string().min(20),
    sansliSayi: z.coerce.number().int().min(1).max(99),
    sansliRenk: z.string().min(2),
  })
);

const haftalikSchema = burclarSemasi(
  z.object({
    genel: z.string().min(40),
    ask: z.string().min(15),
    kariyer: z.string().min(15),
  })
);

const ORTAK_KURALLAR = `Kurallar:
- Türkçe, samimi, günlük konuşma diline yakın ama özenli bir üslup kullan.
- Olumlu ama gerçekçi (abartısız) yaz.
- "Kesinlikle", "mutlaka olacak", "garanti" gibi kesin gelecek iddiaları KURMA — bu eğlence amaçlı bir içerik.
- Tıbbi, hukuki veya finansal kesin tavsiye verme.
- Her burcun yorumu birbirinden belirgin şekilde FARKLI olsun, şablon tekrarından kaçın.

Yalnızca istenen JSON şemasına birebir uyan, başka hiçbir açıklama içermeyen bir JSON döndür.`;

const GUNLUK_SISTEM_PROMPTU = `Sen sosyektif.com için yazan, sıcak ve esprili dilli bir astroloji yazarısın.
Görevin: 12 burcun HER BİRİ için günlük yorum üretmek. Her burç için 2-3 cümlelik bir genel yorum yaz; aşk/iş/enerji gibi alanlardan en az birine değin. Her burç için 1-99 arası şanslı bir sayı ve bir şanslı renk belirle.

${ORTAK_KURALLAR}`;

const HAFTALIK_SISTEM_PROMPTU = `Sen sosyektif.com için yazan, sıcak ve esprili dilli bir astroloji yazarısın.
Görevin: 12 burcun HER BİRİ için bu haftanın yorumunu yazmak. "genel": haftanın genel enerjisini anlatan 3-4 cümle; "ask": aşk ve ilişkiler için 1-2 cümle; "kariyer": iş, okul ve günlük sorumluluklar için 1-2 cümle (para konusunda kesin tavsiye verme).

${ORTAK_KURALLAR}`;

function kullaniciPromptu(baglam: string, alanlar: string): string {
  const burcListesi = BURC_ANAHTARLARI.map((a) => `"${a}" (${BURC_ISIMLERI[a]})`).join(", ");
  const sablon = BURC_ANAHTARLARI.map((a) => `"${a}": ${alanlar}`).join(",\n    ");
  return `${baglam}
Burç anahtarları (JSON key olarak birebir kullan): ${burcListesi}.

Şu formatta bir JSON döndür:
{
  "burclar": {
    ${sablon}
  }
}`;
}

async function gunlukUret(bugun: string): Promise<void> {
  const { text, provider } = await chatComplete({
    systemPrompt: GUNLUK_SISTEM_PROMPTU,
    userPrompt: kullaniciPromptu(`Bugünün tarihi: ${bugun}.`, `{"yorum": "...", "sansliSayi": 0, "sansliRenk": "..."}`),
    jsonMode: true,
    temperature: 0.9,
    kalite: "yuksek",
  });
  const veri = parseJsonLoose(text, gunlukSchema);
  await jsonYaz(GUNLUK_YOL, { tarih: bugun, uretenProvider: provider, burclar: veri.burclar });
  console.log(`[burc] ${bugun} günlük yorumu üretildi (${provider}).`);
}

async function haftalikUret(hafta: string): Promise<void> {
  const { text, provider } = await chatComplete({
    systemPrompt: HAFTALIK_SISTEM_PROMPTU,
    userPrompt: kullaniciPromptu(`Hafta: ${hafta} Pazartesi ile başlayan 7 gün.`, `{"genel": "...", "ask": "...", "kariyer": "..."}`),
    jsonMode: true,
    temperature: 0.9,
    kalite: "yuksek",
  });
  const veri = parseJsonLoose(text, haftalikSchema);
  await jsonYaz(HAFTALIK_YOL, { hafta, uretenProvider: provider, burclar: veri.burclar });
  console.log(`[burc] ${hafta} haftası yorumu üretildi (${provider}).`);
}

async function main() {
  const bugun = turkiyeTarihi();
  const hafta = haftaBasi(bugun);
  const hatalar: string[] = [];

  if ((await jsonOku(GUNLUK_YOL))?.tarih === bugun) {
    console.log(`[burc] ${bugun} günlük yorumu zaten var, atlanıyor.`);
  } else {
    await gunlukUret(bugun).catch((err) => hatalar.push(`günlük: ${err instanceof Error ? err.message : err}`));
  }

  if ((await jsonOku(HAFTALIK_YOL))?.hafta === hafta) {
    console.log(`[burc] ${hafta} haftalık yorumu zaten var, atlanıyor.`);
  } else {
    await haftalikUret(hafta).catch((err) => hatalar.push(`haftalık: ${err instanceof Error ? err.message : err}`));
  }

  if (hatalar.length > 0) {
    const mesaj = hatalar.join("\n");
    console.error("[burc] hata:", mesaj);
    await notifyAdmin(`⚠️ Burç yorumu üretilemedi:\n${mesaj.slice(0, 500)}`).catch(() => {});
    // Biri başarılı olduysa onun commit'lenmesi için workflow'u düşürme.
    if (hatalar.length === 2) process.exit(1);
  }
}

main().catch((err) => {
  console.error("[burc] beklenmeyen hata:", err);
  process.exit(1);
});
