/**
 * Kaynak metin toplama — İçerik Ajanı'nın halüsinasyon riskini azaltmak için
 * (PLAN.md R2) LLM'e serbest üretim yerine gerçek bir kaynak metni verilir.
 *
 * İlk sürüm yalnızca Vikipedi özet paragrafını (birkaç cümle) veriyordu; bu,
 * 7-10 maddelik bir liste için yetersiz kaldı ve yazar kaynağı tekrar etmekten
 * öteye geçemedi. Artık:
 *  - Türkçe Vikipedi maddesinin gövdesi (kaynakça vb. bölümler hariç),
 *  - aynı maddenin İngilizce Vikipedi karşılığı (genelde çok daha zengin)
 * birlikte verilir. İkisi de CC BY-SA ile atıf yapılarak kaynak gösterilir.
 */
import type { Kaynak } from "../lib/schemas.js";

const UA = { "User-Agent": "sosyektif-bot/0.1 (https://sosyektif.com)" };

// Toplam metin, Cerebras'ın ücretsiz katmandaki ~8k token bağlam sınırına ve
// Groq'un dakikalık token limitine sığacak şekilde sınırlandırılır.
const TR_MAX_KARAKTER = 4000;
const EN_MAX_KARAKTER = 3000;
const MIN_TOPLAM_KARAKTER = 600;

const KESILECEK_BOLUMLER = [
  "kaynakça", "kaynaklar", "dış bağlantılar", "ayrıca bakınız", "notlar", "dipnotlar",
  "references", "external links", "see also", "notes", "further reading", "bibliography",
  "sources", "citations",
];

export interface GatheredSource {
  /** Ana madde başlığı (TR yoksa EN). */
  baslik: string;
  /** LLM'e verilen birleşik kaynak metni. */
  metin: string;
  url: string;
  kaynaklar: Kaynak[];
}

type WikiLang = "tr" | "en";

interface WikiPage {
  title: string;
  missing?: boolean;
  extract?: string;
  pageprops?: Record<string, string>;
  langlinks?: { lang: string; title: string }[];
}

async function wikiApi(
  lang: WikiLang,
  params: Record<string, string>
): Promise<{ query?: { pages?: WikiPage[]; search?: { title: string }[] } } | null> {
  const url = new URL(`https://${lang}.wikipedia.org/w/api.php`);
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  try {
    const res = await fetch(url, { headers: UA });
    if (!res.ok) return null;
    return (await res.json()) as { query?: { pages?: WikiPage[]; search?: { title: string }[] } };
  } catch {
    return null;
  }
}

function kullanilabilirSayfa(page: WikiPage | undefined): page is WikiPage {
  if (!page || page.missing) return false;
  // Anlam ayrımı sayfaları içerik değil, seçenek listesidir.
  return !(page.pageprops && "disambiguation" in page.pageprops);
}

async function resolveTitle(lang: WikiLang, sorgu: string): Promise<string | null> {
  const dogrudan = await wikiApi(lang, {
    action: "query",
    titles: sorgu,
    redirects: "1",
    prop: "pageprops",
    ppprop: "disambiguation",
  });
  const sayfa = dogrudan?.query?.pages?.[0];
  if (kullanilabilirSayfa(sayfa)) return sayfa.title;

  const arama = await wikiApi(lang, {
    action: "query",
    list: "search",
    srsearch: sorgu,
    srlimit: "3",
  });
  for (const sonuc of arama?.query?.search ?? []) {
    const kontrol = await wikiApi(lang, {
      action: "query",
      titles: sonuc.title,
      prop: "pageprops",
      ppprop: "disambiguation",
    });
    const aday = kontrol?.query?.pages?.[0];
    if (kullanilabilirSayfa(aday)) return aday.title;
  }
  return null;
}

function temizle(ham: string, maxKarakter: number): string {
  const satirlar: string[] = [];
  for (const satir of ham.split("\n")) {
    const baslik = satir.match(/^=+\s*(.+?)\s*=+$/);
    if (baslik) {
      if (KESILECEK_BOLUMLER.includes(baslik[1]!.toLocaleLowerCase("tr"))) break;
      satirlar.push(`\n${baslik[1]}:`);
      continue;
    }
    if (satir.trim()) satirlar.push(satir.trim());
  }

  let metin = satirlar.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (metin.length > maxKarakter) {
    const kesit = metin.slice(0, maxKarakter);
    const sonNokta = kesit.lastIndexOf(". ");
    metin = sonNokta > maxKarakter * 0.6 ? kesit.slice(0, sonNokta + 1) : kesit;
  }
  return metin;
}

async function fetchExtract(lang: WikiLang, baslik: string, maxKarakter: number): Promise<string> {
  const veri = await wikiApi(lang, {
    action: "query",
    prop: "extracts",
    explaintext: "1",
    redirects: "1",
    titles: baslik,
  });
  return temizle(veri?.query?.pages?.[0]?.extract ?? "", maxKarakter);
}

async function ingilizceKarsiligi(trBaslik: string): Promise<string | null> {
  const veri = await wikiApi("tr", {
    action: "query",
    prop: "langlinks",
    lllang: "en",
    redirects: "1",
    titles: trBaslik,
  });
  return veri?.query?.pages?.[0]?.langlinks?.[0]?.title ?? null;
}

function wikiUrl(lang: WikiLang, baslik: string): string {
  return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(baslik.replace(/ /g, "_"))}`;
}

/**
 * Bir konu için TR (+ varsa EN) Vikipedi metnini toplar. Yeterli malzeme
 * yoksa null döner — bu durumda içerik üretilmez (kaynaksız içerik yok).
 */
export async function gatherSourceFor(konu: string): Promise<GatheredSource | null> {
  const trBaslik = await resolveTitle("tr", konu);
  let trMetin = "";
  let enBaslik: string | null = null;

  if (trBaslik) {
    trMetin = await fetchExtract("tr", trBaslik, TR_MAX_KARAKTER);
    enBaslik = await ingilizceKarsiligi(trBaslik);
  } else {
    enBaslik = await resolveTitle("en", konu);
  }

  // TR metni zaten zenginse EN'den daha az al; toplam bütçe korunur.
  const enButce = trMetin.length > 2500 ? EN_MAX_KARAKTER - 1000 : EN_MAX_KARAKTER + 1000;
  const enMetin = enBaslik ? await fetchExtract("en", enBaslik, enButce) : "";

  if (trMetin.length + enMetin.length < MIN_TOPLAM_KARAKTER) return null;

  const kaynaklar: Kaynak[] = [];
  const parcalar: string[] = [];
  if (trBaslik && trMetin) {
    kaynaklar.push({ baslik: `Vikipedi — ${trBaslik}`, url: wikiUrl("tr", trBaslik), atif: "CC BY-SA 4.0" });
    parcalar.push(`[Türkçe Vikipedi: ${trBaslik}]\n${trMetin}`);
  }
  if (enBaslik && enMetin) {
    kaynaklar.push({ baslik: `Wikipedia (EN) — ${enBaslik}`, url: wikiUrl("en", enBaslik), atif: "CC BY-SA 4.0" });
    parcalar.push(`[İngilizce Wikipedia: ${enBaslik}]\n${enMetin}`);
  }

  return {
    baslik: trBaslik ?? enBaslik ?? konu,
    metin: parcalar.join("\n\n"),
    url: kaynaklar[0]!.url,
    kaynaklar,
  };
}
