/**
 * Burç uyumu içerikleri: 12 burç → 78 çift (aynı burç çiftleri dahil).
 *
 * Uyum yorumları zamansız olduğu için her gün üretilmez; tek seferlik bir iştir
 * (.github/workflows/burc-uyum.yml, elle tetiklenir). Kaldığı yerden devam
 * eder: dosyada zaten olan çiftler atlanır ve her grup bittikçe dosya yazılır —
 * kota dolar ya da iş yarıda kalırsa tekrar çalıştırmak yeterli.
 *
 * Anahtar biçimi "koc-akrep": BURC_ANAHTARLARI sırasında önce gelen burç
 * başta. site/src/lib/burclar.ts -> uyumAnahtari ile aynı kural.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { chatComplete } from "../lib/llmRouter.js";
import { parseJsonLoose } from "../lib/json.js";
import { notifyAdmin } from "../lib/telegram.js";
import { SITE_DIR } from "../lib/paths.js";
import { BURC_ANAHTARLARI, BURC_ISIMLERI, type BurcAnahtari } from "../lib/burclar.js";

const UYUM_YOLU = path.join(SITE_DIR, "src", "data", "burc-uyum.json");
const GRUP_BOYUTU = 6;

const uyumSchema = z.object({
  puan: z.coerce.number().int().min(1).max(100),
  ozet: z.string().min(10),
  ask: z.string().min(30),
  arkadaslik: z.string().min(20),
  is: z.string().min(20),
});
type Uyum = z.infer<typeof uyumSchema>;

const anahtar = (a: BurcAnahtari, b: BurcAnahtari) => `${a}-${b}`;

function tumCiftler(): [BurcAnahtari, BurcAnahtari][] {
  return BURC_ANAHTARLARI.flatMap((a, i) => BURC_ANAHTARLARI.slice(i).map((b) => [a, b] as [BurcAnahtari, BurcAnahtari]));
}

const SISTEM_PROMPTU = `Sen sosyektif.com için yazan, sıcak ve esprili dilli bir astroloji yazarısın. Görevin burç çiftlerinin uyumunu yorumlamak.

Her çift için:
- "puan": 1-100 arası uyum puanı.
- "ozet": tek cümlelik, akılda kalan bir özet.
- "ask": aşk ve ilişki uyumu, 2-3 cümle.
- "arkadaslik": arkadaşlık uyumu, 2 cümle.
- "is": iş ortaklığı ve ekip çalışması uyumu, 2 cümle.

Kurallar:
- Türkçe, samimi ama özenli yaz.
- Puanları gerçekçi dağıt, her çifte yüksek puan verme: geleneksel astrolojiye göre aynı element ya da ateş-hava / toprak-su çiftleri genelde daha uyumlu, birbirine kare açıdaki burçlar daha zorludur. Puanlar 35-95 arasında değişsin.
- Aynı burçtan iki kişiyi (ör. "koc-koc") de yorumla.
- Burçların bilinen özelliklerine (element, yönetici gezegen, karakter) değin; her çiftin yorumu kendine özgü olsun, kalıp cümleleri tekrar etme.
- "Kesinlikle", "asla", "mutlaka" gibi kesin hükümler kurma. Eğlence tonunu koru; kimseyi bir burçtan uzak durmaya yönlendirme.

Yalnızca istenen JSON'u döndür, başka metin yazma.`;

function kullaniciPromptu(ciftler: [BurcAnahtari, BurcAnahtari][]): string {
  const liste = ciftler.map(([a, b]) => `"${anahtar(a, b)}" (${BURC_ISIMLERI[a]} & ${BURC_ISIMLERI[b]})`).join("\n");
  return `Şu çiftleri yorumla (JSON key olarak birebir kullan):
${liste}

Şu formatta bir JSON döndür:
{
  "ciftler": {
    "<anahtar>": { "puan": 0, "ozet": "...", "ask": "...", "arkadaslik": "...", "is": "..." }
  }
}`;
}

async function mevcutOku(): Promise<Record<string, Uyum>> {
  try {
    return JSON.parse(await readFile(UYUM_YOLU, "utf-8")) as Record<string, Uyum>;
  } catch {
    return {};
  }
}

/** Anahtarlar hep aynı sırada yazılır ki commit diff'leri okunur kalsın. */
async function yaz(veri: Record<string, Uyum>): Promise<void> {
  const sirali = Object.fromEntries(
    tumCiftler()
      .map(([a, b]) => anahtar(a, b))
      .filter((k) => veri[k])
      .map((k) => [k, veri[k]])
  );
  await mkdir(path.dirname(UYUM_YOLU), { recursive: true });
  await writeFile(UYUM_YOLU, JSON.stringify(sirali, null, 2) + "\n", "utf-8");
}

async function main() {
  const mevcut = await mevcutOku();
  const ciftler = tumCiftler();
  const eksik = ciftler.filter(([a, b]) => !mevcut[anahtar(a, b)]);
  console.log(`[burc-uyum] ${ciftler.length - eksik.length}/${ciftler.length} hazır, ${eksik.length} eksik.`);

  const hatalar: string[] = [];
  for (let i = 0; i < eksik.length; i += GRUP_BOYUTU) {
    const grup = eksik.slice(i, i + GRUP_BOYUTU);
    try {
      const { text, provider } = await chatComplete({
        systemPrompt: SISTEM_PROMPTU,
        userPrompt: kullaniciPromptu(grup),
        jsonMode: true,
        temperature: 0.8,
      });
      const ham = parseJsonLoose(text, z.object({ ciftler: z.record(z.unknown()) }));
      let eklenen = 0;
      for (const [a, b] of grup) {
        // Model anahtarı ters sırayla yazmış olabilir.
        const sonuc = uyumSchema.safeParse(ham.ciftler[anahtar(a, b)] ?? ham.ciftler[anahtar(b, a)]);
        if (sonuc.success) {
          mevcut[anahtar(a, b)] = sonuc.data;
          eklenen++;
        }
      }
      await yaz(mevcut);
      console.log(`[burc-uyum] grup ${i / GRUP_BOYUTU + 1}: ${eklenen}/${grup.length} çift (${provider})`);
    } catch (err) {
      hatalar.push(err instanceof Error ? err.message.slice(0, 200) : String(err));
    }
  }

  const hazir = Object.keys(mevcut).length;
  console.log(`[burc-uyum] toplam ${hazir}/${ciftler.length} çift hazır.`);
  if (hazir < ciftler.length) {
    // Kısmi ilerleme de commit'lensin diye çıkış kodu 0; eksikler bir sonraki çalıştırmada tamamlanır.
    await notifyAdmin(
      `⚠️ Burç uyumu: ${hazir}/${ciftler.length} çift hazır, eksikler için workflow'u tekrar çalıştır.` +
        (hatalar.length ? `\nSon hata: ${hatalar.at(-1)}` : "")
    ).catch(() => {});
  }
}

main().catch((err) => {
  console.error("[burc-uyum] beklenmeyen hata:", err);
  process.exit(1);
});
