/**
 * Günlük burç yorumu üretimi (.github/workflows/burc.yml, günde 1 kez).
 *
 * 12 burcun tamamı TEK bir LLM çağrısında üretilir (12 ayrı çağrı yerine —
 * kota tasarrufu + tutarlı üslup). Çıktı site/src/data/gunluk-burc.json'a
 * yazılır; Astro build zamanında doğrudan import eder.
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { chatComplete } from "../lib/llmRouter.js";
import { parseJsonLoose } from "../lib/json.js";
import { notifyAdmin } from "../lib/telegram.js";
import { SITE_DIR } from "../lib/paths.js";
import { BURC_ANAHTARLARI, BURC_ISIMLERI, type BurcAnahtari } from "../lib/burclar.js";

const GUNLUK_BURC_YOLU = path.join(SITE_DIR, "src", "data", "gunluk-burc.json");

const burcYorumSchema = z.object({
  yorum: z.string().min(20),
  sansliSayi: z.number().int().min(1).max(99),
  sansliRenk: z.string().min(2),
});

const cikitSchemaSekli = Object.fromEntries(
  BURC_ANAHTARLARI.map((anahtar) => [anahtar, burcYorumSchema])
) as Record<BurcAnahtari, typeof burcYorumSchema>;
const cikitSchema = z.object({ burclar: z.object(cikitSchemaSekli) });

const SISTEM_PROMPTU = `Sen sosyektif.com için yazan, sıcak ve esprili dilli bir astroloji yazarısın.
Görevin: 12 burcun HER BİRİ için günlük yorum üretmek.

Kurallar:
- Türkçe, samimi, günlük konuşma diline yakın ama özenli bir üslup kullan.
- Her burç için 2-3 cümlelik, olumlu ama gerçekçi (abartısız) bir genel yorum yaz; aşk/iş/enerji gibi alanlardan en az birine değin.
- "Kesinlikle", "mutlaka olacak", "garanti" gibi kesin gelecek iddiaları KURMA — bu eğlence amaçlı bir içerik.
- Tıbbi, hukuki veya finansal kesin tavsiye verme.
- Her burç için 1-99 arası şanslı bir sayı ve bir şanslı renk belirle.
- Her burcun yorumu birbirinden belirgin şekilde FARKLI olsun, şablon tekrarından kaçın.

Yalnızca istenen JSON şemasına birebir uyan, başka hiçbir açıklama içermeyen bir JSON döndür.`;

function kullaniciPromptu(tarih: string): string {
  const burcListesi = BURC_ANAHTARLARI.map((a) => `"${a}" (${BURC_ISIMLERI[a]})`).join(", ");
  const alanlar = BURC_ANAHTARLARI.map(
    (a) => `"${a}": {"yorum": "...", "sansliSayi": 0, "sansliRenk": "..."}`
  ).join(",\n    ");
  return `Bugünün tarihi: ${tarih}.
Burç anahtarları (JSON key olarak birebir kullan): ${burcListesi}.

Şu formatta bir JSON döndür:
{
  "burclar": {
    ${alanlar}
  }
}`;
}

async function main() {
  const bugun = new Date();
  const tarih = bugun.toISOString().slice(0, 10);

  const { text, provider } = await chatComplete({
    systemPrompt: SISTEM_PROMPTU,
    userPrompt: kullaniciPromptu(tarih),
    jsonMode: true,
    temperature: 0.9,
    kalite: "yuksek",
  });

  const veri = parseJsonLoose(text, cikitSchema);

  const cikti = { tarih, uretenProvider: provider, burclar: veri.burclar };

  await mkdir(path.dirname(GUNLUK_BURC_YOLU), { recursive: true });
  await writeFile(GUNLUK_BURC_YOLU, JSON.stringify(cikti, null, 2) + "\n", "utf-8");

  console.log(`[burc] ${tarih} için 12 burç yorumu üretildi (${provider}).`);
}

main().catch(async (err) => {
  const mesaj = err instanceof Error ? err.message : String(err);
  console.error("[burc] hata:", mesaj);
  await notifyAdmin(`⚠️ Günlük burç yorumu üretilemedi:\n${mesaj.slice(0, 500)}`).catch(() => {});
  process.exit(1);
});
