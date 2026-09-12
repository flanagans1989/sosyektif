/**
 * Instagram carousel slayt şablonları — 1080×1350 (4:5) HTML/CSS
 * (render: htmlRender.ts). Marka: pembe #FF4F64, mürekkep #201A1C,
 * krem #FFFAF7, Poppins (site ile aynı font). Arka planda içeriğin kendi
 * kapak fotoğrafı kullanılır; yoksa marka gradyanına düşülür.
 *
 * Yerleşim kuralı: sabit koordinat yok — her şey flexbox ile akar, metin
 * kutuları `data-sigdir` ile sığana kadar küçülür (taşma/üst üste binme olmaz).
 */
import { fontFaceCss } from "./htmlRender.js";

export const SLAYT_GENISLIK = 1080;
export const SLAYT_YUKSEKLIK = 1350;

const MARKA = "#FF4F64";
const MARKA_KOYU = "#E23A50";
const MUREKKEP = "#201A1C";
const KREM = "#FFFAF7";

function esc(metin: string): string {
  return metin
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** favicon.svg ile aynı işaret. */
function logoIsareti(boyut: number, zemin = MARKA, cizgi = "#fff"): string {
  return `<svg width="${boyut}" height="${boyut}" viewBox="0 0 48 48" aria-hidden="true">
    <rect width="48" height="48" rx="11" fill="${zemin}"/>
    <circle cx="21" cy="21" r="9.5" fill="none" stroke="${cizgi}" stroke-width="4.5"/>
    <line x1="28.2" y1="28.2" x2="36.5" y2="36.5" stroke="${cizgi}" stroke-width="5" stroke-linecap="round"/>
  </svg>`;
}

function logoSatiri(renk: "acik" | "koyu"): string {
  const yazi = renk === "acik" ? "#fff" : MUREKKEP;
  return `<div class="logo">${logoIsareti(52)}<span style="color:${yazi}">sos<span style="color:${renk === "acik" ? "#FFD3D9" : MARKA}">yektif</span></span></div>`;
}

export interface SlaytBaglami {
  /** data: URI olarak gömülü kapak fotoğrafı; yoksa gradyan kullanılır. */
  fotoDataUri: string | null;
  kategoriEtiketi: string;
  kategoriEmoji: string;
  formatEtiketi: string;
  formatEmoji: string;
}

function belge(govde: string, ekCss = ""): string {
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><style>
    ${fontFaceCss()}
    *{box-sizing:border-box;margin:0;padding:0}
    html,body{width:${SLAYT_GENISLIK}px;height:${SLAYT_YUKSEKLIK}px;overflow:hidden}
    body{font-family:"Poppins","Noto Color Emoji","Segoe UI Emoji","Apple Color Emoji",sans-serif;color:${MUREKKEP};background:${KREM};-webkit-font-smoothing:antialiased}
    .logo{display:flex;align-items:center;gap:16px;font-size:40px;font-weight:800;letter-spacing:-0.3px}
    .chip{display:inline-flex;align-items:center;gap:12px;padding:14px 28px;border-radius:999px;font-size:30px;font-weight:600;white-space:nowrap}
    .chip-cam{background:rgba(255,255,255,.16);border:2px solid rgba(255,255,255,.35);color:#fff;backdrop-filter:blur(14px)}
    .chip-marka{background:${MARKA};color:#fff;box-shadow:0 10px 30px rgba(255,79,100,.45)}
    .chip-acik{background:#FFE8EB;color:${MARKA_KOYU}}
    .ilerleme{display:flex;gap:10px}
    .ilerleme i{display:block;height:10px;border-radius:5px;background:rgba(32,26,28,.14);width:28px}
    .ilerleme i.aktif{background:${MARKA};width:64px}
    ${ekCss}
  </style></head><body>${govde}</body></html>`;
}

function fotoKatmani(baglam: SlaytBaglami, { bulanik = false, konum = "center" } = {}): string {
  if (!baglam.fotoDataUri) {
    return `<div style="position:absolute;inset:0;background:radial-gradient(circle at 80% 10%,#FF8A9A 0,transparent 45%),radial-gradient(circle at 10% 90%,#FF2E4D 0,transparent 50%),linear-gradient(160deg,${MARKA},${MARKA_KOYU})"></div>`;
  }
  const filtre = bulanik ? "filter:blur(28px) saturate(1.2);transform:scale(1.15);" : "";
  return `<div style="position:absolute;inset:0;background:url('${baglam.fotoDataUri}') ${konum}/cover no-repeat;${filtre}"></div>`;
}

function ilerlemeCubugu(sira: number, toplam: number): string {
  return `<div class="ilerleme">${Array.from({ length: toplam }, (_, i) => `<i class="${i === sira ? "aktif" : ""}"></i>`).join("")}</div>`;
}

// ---------------------------------------------------------------- Kapak

export function kapakSlayti(
  baglam: SlaytBaglami,
  p: { baslik: string; aciklama: string; cta: string; toplam: number; ozet?: string }
): string {
  return belge(
    `
    <div style="position:relative;width:100%;height:100%;overflow:hidden">
      ${fotoKatmani(baglam)}
      <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(20,12,14,.55) 0%,rgba(20,12,14,0) 26%,rgba(20,12,14,.15) 42%,rgba(20,12,14,.82) 66%,rgba(20,12,14,.95) 100%)"></div>
      <div style="position:absolute;inset:0;display:flex;flex-direction:column;padding:64px 72px 72px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          ${logoSatiri("acik")}
          <span class="chip chip-cam">${baglam.kategoriEmoji} ${esc(baglam.kategoriEtiketi)}</span>
        </div>
        <div style="flex:1"></div>
        <div style="display:flex;flex-direction:column;gap:30px">
          <span class="chip chip-marka" style="align-self:flex-start">${baglam.formatEmoji} ${esc(baglam.formatEtiketi)}</span>
          <h1 data-sigdir="52" style="color:#fff;font-size:92px;line-height:1.08;font-weight:800;letter-spacing:-0.5px;max-height:520px;overflow:hidden;text-wrap:balance">${esc(p.baslik)}</h1>
          <p data-sigdir="26" style="color:rgba(255,255,255,.82);font-size:34px;line-height:1.4;font-weight:500;max-height:150px;overflow:hidden">${esc(p.aciklama)}</p>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-top:10px">
            <span class="chip" style="background:#fff;color:${MARKA};font-size:34px;font-weight:700;padding:20px 40px;box-shadow:0 14px 40px rgba(0,0,0,.3)">${esc(p.cta)} <span style="font-size:40px">→</span></span>
            ${p.ozet ? `<span style="color:rgba(255,255,255,.75);font-size:30px;font-weight:600">${esc(p.ozet)}</span>` : ""}
          </div>
        </div>
      </div>
    </div>`
  );
}

// ---------------------------------------------------------------- Ortak içerik iskeleti

/** Üstte fotoğraf bandı + büyük numara, altında bandın üstüne binen beyaz kart. */
function icerikIskeleti(
  baglam: SlaytBaglami,
  p: { sira: number; toplam: number; buyukEtiket: string; kucukEtiket: string; kart: string; altNot: string }
): string {
  // Her slaytta fotoğrafın farklı bölgesi görünsün diye konum kaydırılır.
  const konumlar = ["center", "20% 30%", "80% 40%", "50% 80%", "30% 60%", "70% 20%"];
  const konum = konumlar[p.sira % konumlar.length];
  return belge(
    `
    <div style="position:relative;width:100%;height:100%;overflow:hidden;background:${KREM}">
      <div style="position:absolute;left:0;top:0;right:0;height:500px;overflow:hidden">
        ${fotoKatmani(baglam, { konum })}
        <div style="position:absolute;inset:0;background:linear-gradient(160deg,rgba(255,79,100,.78),rgba(32,26,28,.72))"></div>
      </div>
      <div style="position:absolute;inset:0;display:flex;flex-direction:column;padding:56px 64px 60px">
        <div style="display:flex;justify-content:space-between;align-items:center;height:72px">
          ${logoSatiri("acik")}
          <span class="chip chip-cam" style="font-size:26px">${baglam.formatEmoji} ${esc(baglam.formatEtiketi)}</span>
        </div>
        <div style="display:flex;align-items:flex-end;justify-content:space-between;height:250px;padding:0 8px 26px">
          <span style="font-size:200px;line-height:.8;font-weight:800;color:#fff;letter-spacing:-8px;text-shadow:0 20px 50px rgba(0,0,0,.25)">${esc(p.buyukEtiket)}</span>
          <span style="color:rgba(255,255,255,.9);font-size:28px;font-weight:600;padding-bottom:10px">${esc(p.kucukEtiket)}</span>
        </div>
        <div style="flex:1;min-height:0;background:#fff;border-radius:48px;box-shadow:0 40px 90px rgba(32,26,28,.16),0 4px 12px rgba(32,26,28,.06);padding:60px 60px 52px;display:flex;flex-direction:column;gap:30px;overflow:hidden">
          ${p.kart}
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;height:70px;margin-top:26px">
          ${ilerlemeCubugu(p.sira, p.toplam)}
          <span style="font-size:28px;font-weight:600;color:rgba(32,26,28,.55)">${p.altNot}</span>
        </div>
      </div>
    </div>`
  );
}

// ---------------------------------------------------------------- Liste / trivia maddesi

export function maddeSlayti(
  baglam: SlaytBaglami,
  p: { no: number; maddeSayisi: number; baslik: string; metin: string; sira: number; toplam: number }
): string {
  const kart = `
    <h2 data-sigdir="40" style="font-size:60px;line-height:1.18;font-weight:800;letter-spacing:-0.3px;max-height:300px;overflow:hidden;flex-shrink:0">${esc(p.baslik)}</h2>
    <div style="width:96px;height:10px;border-radius:5px;background:${MARKA};flex-shrink:0"></div>
    <p data-sigdir="26" style="flex:1;min-height:0;font-size:40px;line-height:1.5;font-weight:500;color:rgba(32,26,28,.78);overflow:hidden">${esc(p.metin)}</p>`;
  return icerikIskeleti(baglam, {
    sira: p.sira,
    toplam: p.toplam,
    buyukEtiket: String(p.no).padStart(2, "0"),
    kucukEtiket: `${p.no} / ${p.maddeSayisi}`,
    kart,
    altNot: p.sira < p.toplam - 1 ? "Kaydır →" : "",
  });
}

// ---------------------------------------------------------------- Quiz sorusu

export function soruSlayti(
  baglam: SlaytBaglami,
  p: { no: number; soruSayisi: number; soru: string; secenekler: string[]; sira: number; toplam: number }
): string {
  const harfler = ["A", "B", "C", "D", "E", "F"];
  const secenekler = p.secenekler
    .slice(0, 4)
    .map(
      (s, i) => `
      <div style="display:flex;align-items:center;gap:24px;padding:0 28px;border:3px solid #F3E3E6;border-radius:30px;background:${KREM};min-height:0;flex:1">
        <span style="flex-shrink:0;width:64px;height:64px;border-radius:20px;background:#FFE8EB;color:${MARKA_KOYU};display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:800">${harfler[i]}</span>
        <span data-sigdir="24" style="font-size:36px;line-height:1.25;font-weight:600;max-height:100%;overflow:hidden;display:flex;align-items:center;height:100%">${esc(s)}</span>
      </div>`
    )
    .join("");
  const kart = `
    <h2 data-sigdir="34" style="font-size:54px;line-height:1.22;font-weight:800;letter-spacing:-0.2px;max-height:270px;overflow:hidden;flex-shrink:0">${esc(p.soru)}</h2>
    <div style="flex:1;min-height:0;display:flex;flex-direction:column;gap:18px">${secenekler}</div>`;
  return icerikIskeleti(baglam, {
    sira: p.sira,
    toplam: p.toplam,
    buyukEtiket: String(p.no).padStart(2, "0"),
    kucukEtiket: `Soru ${p.no} / ${p.soruSayisi}`,
    kart,
    altNot: "Cevap sitede 👀",
  });
}

// ---------------------------------------------------------------- Kişilik testi sonuçları

export function sonuclarSlayti(
  baglam: SlaytBaglami,
  p: { sonuclar: string[]; sira: number; toplam: number }
): string {
  const ikonlar = ["🌟", "🔥", "🌙", "⚡", "🌿", "💎"];
  const satirlar = p.sonuclar
    .slice(0, 6)
    .map(
      (s, i) => `
      <div style="display:flex;align-items:center;gap:22px;padding:0 28px;border-radius:28px;background:${i % 2 ? KREM : "#FFF0F2"};flex:1;min-height:0">
        <span style="font-size:44px;flex-shrink:0">${ikonlar[i % ikonlar.length]}</span>
        <span data-sigdir="24" style="font-size:38px;font-weight:700;line-height:1.2;overflow:hidden;max-height:100%">${esc(s)}</span>
      </div>`
    )
    .join("");
  const kart = `
    <h2 style="font-size:54px;line-height:1.15;font-weight:800;flex-shrink:0">Hangisi sensin?</h2>
    <div style="flex:1;min-height:0;display:flex;flex-direction:column;gap:16px">${satirlar}</div>`;
  return icerikIskeleti(baglam, {
    sira: p.sira,
    toplam: p.toplam,
    buyukEtiket: "?",
    kucukEtiket: `${p.sonuclar.length} olası sonuç`,
    kart,
    altNot: "Kaydır →",
  });
}

// ---------------------------------------------------------------- Kapanış (CTA)

export function kapanisSlayti(
  baglam: SlaytBaglami,
  p: { baslik: string; altBaslik: string; sira: number; toplam: number }
): string {
  const aksiyon = (emoji: string, yazi: string) =>
    `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:14px;padding:30px 0;border-radius:32px;background:rgba(255,255,255,.14);border:2px solid rgba(255,255,255,.28)">
      <span style="font-size:60px;line-height:1">${emoji}</span>
      <span style="font-size:30px;font-weight:700;color:#fff">${yazi}</span>
    </div>`;
  return belge(
    `
    <div style="position:relative;width:100%;height:100%;overflow:hidden">
      ${fotoKatmani(baglam, { bulanik: true })}
      <div style="position:absolute;inset:0;background:linear-gradient(160deg,rgba(255,79,100,.93),rgba(214,44,70,.96))"></div>
      <div style="position:absolute;right:-160px;top:-160px;width:520px;height:520px;border-radius:50%;background:rgba(255,255,255,.08)"></div>
      <div style="position:absolute;left:-200px;bottom:-120px;width:600px;height:600px;border-radius:50%;background:rgba(255,255,255,.06)"></div>
      <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;padding:110px 72px 72px;text-align:center">
        <div style="padding:26px;border-radius:44px;background:#fff;box-shadow:0 30px 70px rgba(0,0,0,.22)">${logoIsareti(150)}</div>
        <div style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:28px">
          <h2 data-sigdir="52" style="color:#fff;font-size:84px;line-height:1.1;font-weight:800;letter-spacing:-0.5px;max-height:380px;overflow:hidden;text-wrap:balance">${esc(p.baslik)}</h2>
          <p style="color:rgba(255,255,255,.9);font-size:38px;font-weight:600">${esc(p.altBaslik)}</p>
        </div>
        <div style="display:flex;gap:22px;width:100%;margin-bottom:48px">
          ${aksiyon("❤️", "Beğen")}${aksiyon("🔖", "Kaydet")}${aksiyon("📤", "Paylaş")}
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;width:100%">
          ${ilerlemeCubugu(p.sira, p.toplam)}
          <span class="chip" style="background:#fff;color:${MARKA};font-size:34px;font-weight:800;padding:18px 36px">sosyektif.com</span>
        </div>
      </div>
    </div>`,
    `.ilerleme i{background:rgba(255,255,255,.3)} .ilerleme i.aktif{background:#fff}`
  );
}
