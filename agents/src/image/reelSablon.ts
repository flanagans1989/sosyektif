/**
 * Reels videosu şablonu — 1080×1920 (9:16), tek bir HTML sayfasında CSS
 * animasyon zaman çizelgesi (render: reelRender.ts, kare kare yakalanır).
 *
 * 2026-09-13: ilk sürüm carousel slaytlarını siyah şeritlerle alt alta
 * diziyordu — kullanıcı "kalite kötü, daha yaratıcı ve sinematik olmalı"
 * dedi. Bu sürüm video için baştan tasarlandı: kamera hareketi (Ken Burns),
 * kelime kelime beliren başlıklar, bulanıklaşarak geçen sahneler, film
 * greni + vinyet, hikâye tarzı ilerleme çubuğu. Marka dili carousel ile
 * aynı (pembe #FF4F64, Poppins, renkli emoji).
 *
 * Kapak fotoğrafları 1200×675 yatay; dikey tam ekrana büyütmek bulanık
 * gösteriyordu. Bu yüzden keskin foto yuvarlatılmış bir "çerçeve" içinde,
 * arka plan ise aynı fotoğrafın bulanık/koyulaştırılmış hali.
 *
 * Instagram arayüzü altta ~350px ve sağda ikonlar kaplıyor — önemli metin
 * bu güvenli alanın dışında tutuluyor.
 */
import { fontFaceCss } from "./htmlRender.js";
import type { Post } from "../lib/schemas.js";

export const REEL_GENISLIK = 1080;
export const REEL_YUKSEKLIK = 1920;

const MARKA = "#FF4F64";
const MARKA_KOYU = "#E23A50";
const MUREKKEP = "#201A1C";
const GECE = "#120D0F";

/** Sahneler arası çapraz geçiş süresi (ms) — ardışık sahneler bu kadar üst üste biner. */
const GECIS_MS = 450;

export interface ReelBaglami {
  fotoDataUri: string | null;
  bulanikFotoDataUri: string | null;
  grenDataUri: string;
  kategoriEtiketi: string;
  kategoriEmoji: string;
  formatEtiketi: string;
  formatEmoji: string;
}

function esc(metin: string): string {
  return metin.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** CSS animation kısaltması — gecikme sahnenin mutlak zamanına göre verilir. */
function a(ad: string, sure: number, gecikme: number, egri = "cubic-bezier(.2,.8,.2,1)", dolgu = "both"): string {
  return `${ad} ${Math.round(sure)}ms ${egri} ${Math.round(gecikme)}ms 1 normal ${dolgu}`;
}

const ZIPLA = "cubic-bezier(.3,1.7,.5,1)";

function logoIsareti(boyut: number, zemin = MARKA, cizgi = "#fff"): string {
  return `<svg width="${boyut}" height="${boyut}" viewBox="0 0 48 48" aria-hidden="true">
    <rect width="48" height="48" rx="11" fill="${zemin}"/>
    <circle cx="21" cy="21" r="9.5" fill="none" stroke="${cizgi}" stroke-width="4.5"/>
    <line x1="28.2" y1="28.2" x2="36.5" y2="36.5" stroke="${cizgi}" stroke-width="5" stroke-linecap="round"/>
  </svg>`;
}

/** Metni kelimelere bölüp her birine gecikmeli "yükselerek belirme" verir. */
function kelimeKelime(metin: string, baslangic: number, adim = 75): { html: string; bitis: number } {
  const kelimeler = metin.trim().split(/\s+/);
  const html = kelimeler
    .map((k, i) => `<span class="kelime" style="animation:${a("kelime", 650, baslangic + i * adim)}">${esc(k)}</span>`)
    .join(" ");
  return { html, bitis: baslangic + kelimeler.length * adim + 650 };
}

function arkaPlan(b: ReelBaglami, s: number, sure: number, tonlama: string): string {
  const zemin = b.bulanikFotoDataUri
    ? `<div class="bg" style="background-image:url('${b.bulanikFotoDataUri}');animation:${a("suzul", sure + 900, s, "linear")}"></div>`
    : `<div class="bg" style="background:radial-gradient(circle at 75% 20%,#FF8A9A 0,transparent 45%),radial-gradient(circle at 15% 85%,#8E1B34 0,transparent 55%),linear-gradient(160deg,${MARKA_KOYU},${GECE});animation:${a("suzul", sure + 900, s, "linear")}"></div>`;
  return `${zemin}<div class="kat" style="background:${tonlama}"></div>`;
}

interface Sahne {
  sure: number;
  html: (s: number, sonMu: boolean) => string;
}

function sahneKabi(s: number, sure: number, ilkMi: boolean, sonMu: boolean, ic: string): string {
  const animler = [ilkMi ? a("karar", 350, s, "ease-out") : a("sahneGir", 650, s)];
  if (!sonMu) animler.push(a("sahneCik", GECIS_MS + 50, s + sure - GECIS_MS - 50, "cubic-bezier(.6,0,.8,.3)", "forwards"));
  return `<section class="sahne" style="animation:${animler.join(",")}">${ic}</section>`;
}

// ------------------------------------------------------------------ Açılış

function acilisSahnesi(b: ReelBaglami, post: Post, ozet: string): Sahne {
  const sure = 3900;
  return {
    sure,
    html: (s) => {
      const baslik = kelimeKelime(post.baslik, s + 1050, 70);
      const cerceveIci = b.fotoDataUri
        ? `<div class="foto" style="background-image:url('${b.fotoDataUri}');animation:${a("kenburns", sure + 400, s, "linear")}"></div>`
        : `<div class="foto" style="display:flex;align-items:center;justify-content:center;font-size:260px;background:linear-gradient(160deg,${MARKA},${MARKA_KOYU})">${b.formatEmoji}</div>`;
      return `
        ${arkaPlan(b, s, sure, `linear-gradient(180deg,rgba(18,13,15,.55) 0%,rgba(18,13,15,.35) 40%,rgba(18,13,15,.92) 100%)`)}
        <div class="logo" style="position:absolute;top:150px;left:76px;animation:${a("yukari", 700, s + 150)}">${logoIsareti(58)}<span>sos<b style="color:#FFB3BE">yektif</b></span></div>
        <div class="sutun" style="justify-content:flex-end;padding:0 76px 340px;gap:46px">
          <div class="cerceve" style="animation:${a("cerceveGir", 950, s + 300)}">
            ${cerceveIci}
            <div class="isik" style="animation:${a("supur", 1300, s + 1100, "ease-in-out")}"></div>
          </div>
          <div class="satir">
            <span class="chip chip-marka" style="animation:${a("pop", 600, s + 750, ZIPLA)}">${b.kategoriEmoji} ${esc(b.kategoriEtiketi)}</span>
            <span class="chip chip-cam" style="animation:${a("pop", 600, s + 870, ZIPLA)}">${b.formatEmoji} ${esc(ozet)}</span>
          </div>
          <h1 data-sigdir="54" style="max-height:440px">${baslik.html}</h1>
        </div>`;
    },
  };
}

// ------------------------------------------------------------------ Madde (liste/trivia)

/** Reel bir fragman: maddenin tamamı değil ilk cümlesi gösterilir (devamı sitede). */
function ilkCumle(metin: string, sinir = 170): string {
  const cumle = metin.trim().match(/^.+?[.!?](?=\s|$)/)?.[0] ?? metin.trim();
  return cumle.length <= sinir ? cumle : cumle.slice(0, sinir).replace(/\s+\S*$/, "") + "…";
}

function maddeSahnesi(b: ReelBaglami, no: number, toplam: number, baslik: string, tamMetin: string): Sahne {
  const metin = ilkCumle(tamMetin);
  // Okuma süresi metin uzunluğuyla ölçeklenir.
  const sure = Math.min(5400, Math.max(3800, 2500 + (baslik.length + metin.length) * 14));
  return {
    sure,
    html: (s) => `
      ${arkaPlan(b, s, sure, `radial-gradient(circle at 18% 12%,rgba(255,79,100,.62),transparent 55%),linear-gradient(180deg,rgba(18,13,15,.55),rgba(18,13,15,.92))`)}
      <div class="dev-no-kap" style="animation:${a("noGir", 950, s + 60)}"><span class="dev-no" style="animation:${a("noKay", sure, s, "linear")}">${String(no).padStart(2, "0")}</span></div>
      <div class="sayac" style="animation:${a("pop", 600, s + 350, ZIPLA)}">${b.formatEmoji} ${no} / ${toplam}</div>
      <div class="kart" style="animation:${a("kartGir", 850, s + 280)}">
        <h2 data-sigdir="40" style="max-height:330px;animation:${a("yukari", 700, s + 620)}">${esc(baslik)}</h2>
        <i class="cizgi" style="animation:${a("ciz", 700, s + 780)}"></i>
        <p data-sigdir="32" style="max-height:380px;animation:${a("yukari", 700, s + 900)}">${esc(metin)}</p>
        <div class="isik" style="animation:${a("supur", 1300, s + 1300, "ease-in-out")}"></div>
      </div>`,
  };
}

// ------------------------------------------------------------------ Quiz sorusu

function soruSahnesi(b: ReelBaglami, no: number, toplam: number, soru: string, secenekler: string[]): Sahne {
  const kelimeSayisi = soru.trim().split(/\s+/).length;
  const soruBitis = 500 + kelimeSayisi * 70 + 650;
  const seceneklerBitis = soruBitis + secenekler.slice(0, 4).length * 140 + 500;
  const geriSayim = seceneklerBitis + 300;
  const sure = geriSayim + 3000 + 1300;
  const harfler = ["A", "B", "C", "D"];
  return {
    sure,
    html: (s) => {
      const soruHtml = kelimeKelime(soru, s + 500, 70);
      const secenekHtml = secenekler
        .slice(0, 4)
        .map(
          (sec, i) => `<div class="secenek" style="animation:${a("yanGir", 650, s + soruBitis + i * 140)}">
            <b>${harfler[i]}</b><span data-sigdir="26" style="max-height:112px">${esc(sec)}</span></div>`
        )
        .join("");
      const sayilar = [3, 2, 1]
        .map((n, i) => `<span class="gs-sayi" style="animation:${a("sayi", 1000, s + geriSayim + i * 1000, "ease-out")}">${n}</span>`)
        .join("");
      return `
        ${arkaPlan(b, s, sure, `radial-gradient(circle at 85% 10%,rgba(255,79,100,.6),transparent 50%),linear-gradient(180deg,rgba(18,13,15,.6),rgba(18,13,15,.93))`)}
        <div class="sutun" style="justify-content:center;padding:250px 76px 380px;gap:40px">
          <div class="satir" style="justify-content:space-between">
            <span class="chip chip-marka" style="animation:${a("pop", 600, s + 200, ZIPLA)}">🧠 Soru ${no} / ${toplam}</span>
            <div class="geri-sayim" style="animation:${a("pop", 500, s + geriSayim - 250, ZIPLA)}">
              <svg viewBox="0 0 160 160"><circle cx="80" cy="80" r="70" class="halka-zemin"/><circle cx="80" cy="80" r="70" class="halka" style="animation:${a("halka", 3000, s + geriSayim, "linear")}"/></svg>
              ${sayilar}
            </div>
          </div>
          <h2 class="soru" data-sigdir="46" style="max-height:470px">${soruHtml.html}</h2>
          <div class="secenekler">${secenekHtml}</div>
          <div class="cevap" style="animation:${a("pop", 650, s + geriSayim + 3050, ZIPLA)}">Cevap sitede 👀</div>
        </div>`;
    },
  };
}

// ------------------------------------------------------------------ Kişilik sonuçları

function sonuclarSahnesi(b: ReelBaglami, sonuclar: string[]): Sahne {
  const liste = sonuclar.slice(0, 5);
  const sure = 2200 + liste.length * 450;
  const ikonlar = ["🌟", "🔥", "🌙", "⚡", "💎"];
  return {
    sure,
    html: (s) => `
      ${arkaPlan(b, s, sure, `radial-gradient(circle at 20% 15%,rgba(255,79,100,.6),transparent 55%),linear-gradient(180deg,rgba(18,13,15,.55),rgba(18,13,15,.93))`)}
      <div class="sutun" style="justify-content:center;padding:250px 76px 380px;gap:34px">
        <h2 class="soru" style="animation:${a("yukari", 700, s + 250)}">Hangisi sensin?</h2>
        ${liste
          .map(
            (sonuc, i) => `<div class="secenek" style="animation:${a("yanGir", 650, s + 650 + i * 220)}">
              <b style="background:transparent;font-size:54px">${ikonlar[i]}</b><span data-sigdir="26" style="max-height:112px">${esc(sonuc)}</span></div>`
          )
          .join("")}
      </div>`,
  };
}

// ------------------------------------------------------------------ Kapanış

function kapanisSahnesi(baslik: string): Sahne {
  const sure = 3800;
  const parcaciklar = ["✨", "🔍", "💡", "✨", "🤯", "⭐", "✨", "💫", "🔥", "✨"];
  return {
    sure,
    html: (s) => {
      const metin = kelimeKelime(baslik, s + 900, 80);
      const tozlar = parcaciklar
        .map((e, i) => {
          const sol = 6 + ((i * 97) % 88);
          const boyut = 44 + ((i * 37) % 50);
          return `<span class="toz" style="left:${sol}%;font-size:${boyut}px;animation:${a("yuzen", 2600 + (i % 3) * 500, s + 200 + i * 230, "ease-out")}">${e}</span>`;
        })
        .join("");
      return `
        <div class="kat kapanis-zemin" style="animation:${a("gradKay", sure, s, "linear")}"></div>
        <div class="kat" style="background:radial-gradient(circle at 50% 38%,rgba(255,255,255,.28),transparent 55%)"></div>
        ${tozlar}
        <div class="isik genis" style="animation:${a("supur", 1600, s + 1500, "ease-in-out")}"></div>
        <div class="sutun" style="align-items:center;justify-content:center;text-align:center;padding:200px 80px 380px;gap:40px">
          <div class="logo-kutu" style="animation:${a("pop", 800, s + 150, ZIPLA)}">${logoIsareti(190)}</div>
          <div class="logo buyuk" style="animation:${a("yukari", 700, s + 550)}"><span>sos<b style="color:#FFD3D9">yektif</b></span></div>
          <h2 class="kapanis-baslik" data-sigdir="52" style="max-height:340px">${metin.html}</h2>
          <div class="adres" style="animation:${a("pop", 650, metin.bitis - 200, ZIPLA)},${a("nabiz", 1400, metin.bitis + 500, "ease-in-out")}">sosyektif.com</div>
          <div class="chip chip-cam" style="animation:${a("yukari", 600, metin.bitis + 150)}">🔔 Takip et, kaçırma</div>
        </div>`;
    },
  };
}

// ------------------------------------------------------------------ Belge

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${REEL_GENISLIK}px;height:${REEL_YUKSEKLIK}px;overflow:hidden;background:${GECE}}
body{font-family:"Poppins","Noto Color Emoji","Segoe UI Emoji","Apple Color Emoji",sans-serif;color:#fff;-webkit-font-smoothing:antialiased}
.sahne{position:absolute;inset:0;overflow:hidden;will-change:transform,opacity}
.kat{position:absolute;inset:0}
.bg{position:absolute;inset:-8%;background-size:cover;background-position:center}
.sutun{position:absolute;inset:0;display:flex;flex-direction:column}
.satir{display:flex;gap:16px;flex-wrap:wrap;align-items:center}
.logo{display:flex;align-items:center;gap:18px;font-size:44px;font-weight:800;letter-spacing:-.3px;color:#fff}
.logo b{font-weight:800}
.logo.buyuk{font-size:92px;letter-spacing:-1.5px}
.logo-kutu{padding:34px;border-radius:60px;background:#fff;box-shadow:0 40px 90px rgba(0,0,0,.3)}
.chip{display:inline-flex;align-items:center;gap:12px;padding:16px 30px;border-radius:999px;font-size:34px;font-weight:700;white-space:nowrap}
.chip-marka{background:${MARKA};color:#fff;box-shadow:0 14px 40px rgba(255,79,100,.55)}
.chip-cam{background:rgba(255,255,255,.14);border:2px solid rgba(255,255,255,.34);color:#fff}
.cerceve{position:relative;width:928px;height:522px;border-radius:44px;overflow:hidden;box-shadow:0 50px 100px rgba(0,0,0,.55);border:3px solid rgba(255,255,255,.22);flex-shrink:0}
.foto{position:absolute;inset:0;background-size:cover;background-position:center}
.isik{position:absolute;top:-20%;bottom:-20%;left:0;width:34%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.38),transparent);pointer-events:none}
.isik.genis{width:40%;opacity:.7}
h1{font-size:94px;line-height:1.07;font-weight:800;letter-spacing:-1.5px;overflow:hidden;text-shadow:0 8px 40px rgba(0,0,0,.45);padding-bottom:10px}
.kelime{display:inline-block}
.dev-no-kap{position:absolute;top:120px;left:34px}
.dev-no{display:block;font-size:600px;line-height:.82;font-weight:800;letter-spacing:-30px;color:transparent;-webkit-text-stroke:5px rgba(255,255,255,.5);text-shadow:0 0 90px rgba(255,79,100,.55)}
.sayac{position:absolute;top:210px;right:76px;padding:16px 30px;border-radius:999px;background:rgba(255,255,255,.14);border:2px solid rgba(255,255,255,.34);font-size:34px;font-weight:700}
.kart{position:absolute;left:64px;right:64px;top:660px;padding:70px 64px 76px;border-radius:60px;background:#fff;color:${MUREKKEP};box-shadow:0 60px 120px rgba(0,0,0,.5);overflow:hidden;display:flex;flex-direction:column;gap:30px}
.kart h2{font-size:68px;line-height:1.1;font-weight:800;letter-spacing:-.8px;overflow:hidden}
.kart p{font-size:44px;line-height:1.42;font-weight:500;color:#4A3F42;overflow:hidden}
.cizgi{display:block;width:150px;height:12px;border-radius:6px;background:${MARKA};transform-origin:left}
.soru{font-size:76px;line-height:1.12;font-weight:800;letter-spacing:-1px;overflow:hidden;text-shadow:0 8px 40px rgba(0,0,0,.45)}
.secenekler{display:flex;flex-direction:column;gap:22px}
.secenek{display:flex;align-items:center;gap:28px;padding:22px 30px;border-radius:34px;background:rgba(255,255,255,.95);color:${MUREKKEP};box-shadow:0 20px 50px rgba(0,0,0,.3)}
.secenek b{flex-shrink:0;display:flex;align-items:center;justify-content:center;width:80px;height:80px;border-radius:24px;background:${MARKA};color:#fff;font-size:42px;font-weight:800}
.secenek span{font-size:42px;line-height:1.2;font-weight:700;overflow:hidden}
.geri-sayim{position:relative;width:150px;height:150px}
.geri-sayim svg{position:absolute;inset:0;transform:rotate(-90deg)}
.halka-zemin{fill:rgba(18,13,15,.55);stroke:rgba(255,255,255,.2);stroke-width:12}
.halka{fill:none;stroke:${MARKA};stroke-width:12;stroke-linecap:round;stroke-dasharray:440}
.gs-sayi{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:72px;font-weight:800}
.cevap{align-self:flex-start;padding:22px 40px;border-radius:999px;background:#fff;color:${MARKA_KOYU};font-size:44px;font-weight:800;box-shadow:0 20px 60px rgba(0,0,0,.35)}
.kapanis-zemin{background:linear-gradient(160deg,#FF6B7D 0%,${MARKA} 35%,${MARKA_KOYU} 65%,#7A1630 100%);background-size:220% 220%}
.kapanis-baslik{font-size:88px;line-height:1.1;font-weight:800;letter-spacing:-1px;overflow:hidden;text-shadow:0 10px 40px rgba(0,0,0,.25)}
.toz{position:absolute;bottom:260px;line-height:1}
.adres{padding:26px 54px;border-radius:999px;background:#fff;color:${MARKA_KOYU};font-size:56px;font-weight:800;box-shadow:0 30px 70px rgba(0,0,0,.28)}
.ilerleme{position:absolute;top:84px;left:60px;right:60px;display:flex;gap:10px;z-index:5}
.ilerleme i{flex:1;height:8px;border-radius:4px;background:rgba(255,255,255,.28);overflow:hidden}
.ilerleme b{display:block;height:100%;background:#fff;transform-origin:left}
.vinyet{position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 52%,rgba(0,0,0,.5) 100%);z-index:6;pointer-events:none}
.gren{position:absolute;inset:0;background-size:256px 256px;opacity:.035;z-index:7;pointer-events:none}
.son-karar{position:absolute;inset:0;background:#000;z-index:8}

@keyframes karar{from{opacity:0}to{opacity:1}}
@keyframes sahneGir{from{opacity:0;transform:scale(1.12);filter:blur(18px)}to{opacity:1;transform:none;filter:blur(0)}}
@keyframes sahneCik{from{opacity:1;transform:none;filter:blur(0)}to{opacity:0;transform:scale(.9);filter:blur(14px)}}
@keyframes suzul{from{transform:scale(1.04) translate3d(0,0,0)}to{transform:scale(1.2) translate3d(-2.5%,-2%,0)}}
@keyframes kenburns{from{transform:scale(1.03)}to{transform:scale(1.22) translate3d(-3%,-2%,0)}}
@keyframes yukari{from{opacity:0;transform:translateY(50px)}to{opacity:1;transform:none}}
@keyframes kelime{from{opacity:0;transform:translateY(70px) rotate(6deg);filter:blur(10px)}to{opacity:1;transform:none;filter:blur(0)}}
@keyframes pop{0%{opacity:0;transform:scale(.3)}100%{opacity:1;transform:scale(1)}}
@keyframes cerceveGir{from{opacity:0;transform:translateY(110px) scale(.88) rotate(-3deg)}to{opacity:1;transform:none}}
@keyframes supur{from{transform:translateX(-160%) skewX(-18deg)}to{transform:translateX(380%) skewX(-18deg)}}
@keyframes noGir{from{opacity:0;transform:translateX(-180px) scale(1.35)}to{opacity:1;transform:none}}
@keyframes noKay{from{transform:translateY(0)}to{transform:translateY(70px)}}
@keyframes kartGir{from{opacity:0;transform:translateY(140px);clip-path:inset(0 0 100% 0 round 60px)}to{opacity:1;transform:none;clip-path:inset(0 0 0 0 round 60px)}}
@keyframes ciz{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes yanGir{from{opacity:0;transform:translateX(180px)}to{opacity:1;transform:none}}
@keyframes sayi{0%{opacity:0;transform:scale(1.9)}18%{opacity:1;transform:scale(1)}80%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(.6)}}
@keyframes halka{from{stroke-dashoffset:0}to{stroke-dashoffset:440}}
@keyframes gradKay{from{background-position:0% 0%}to{background-position:100% 100%}}
@keyframes yuzen{0%{opacity:0;transform:translateY(0) rotate(0) scale(.6)}18%{opacity:1}100%{opacity:0;transform:translateY(-1100px) rotate(50deg) scale(1.1)}}
@keyframes nabiz{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}
@keyframes dol{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes gren{0%{transform:translate(0,0)}20%{transform:translate(-7%,4%)}40%{transform:translate(5%,-6%)}60%{transform:translate(-4%,-3%)}80%{transform:translate(6%,5%)}100%{transform:translate(0,0)}}
`;

function sahneleriKur(b: ReelBaglami, post: Post): Sahne[] {
  if ((post.format === "liste" || post.format === "trivia") && post.listeMaddeleri?.length) {
    const hepsi = post.listeMaddeleri;
    const gosterilen = hepsi.slice(0, 5);
    const kalan = hepsi.length - gosterilen.length;
    return [
      acilisSahnesi(b, post, `${hepsi.length} madde`),
      ...gosterilen.map((m, i) => maddeSahnesi(b, i + 1, hepsi.length, m.baslik, m.metin)),
      kapanisSahnesi(kalan > 0 ? `Kalan ${kalan} madde sitede` : "Kaynaklar ve fazlası sitede"),
    ];
  }
  if (post.format === "quiz" && post.quizSorulari?.length) {
    const hepsi = post.quizSorulari;
    return [
      acilisSahnesi(b, post, `${hepsi.length} soru`),
      ...hepsi.slice(0, 3).map((q, i) => soruSahnesi(b, i + 1, hepsi.length, q.soru, q.secenekler)),
      kapanisSahnesi(hepsi.length > 3 ? `Kalan ${hepsi.length - 3} soru ve cevaplar sitede` : "Kaç tanesini bildin? Cevaplar sitede"),
    ];
  }
  if (post.format === "kisilik") {
    const sonuclar = (post.kisilikSonuclari ?? []).map((s) => s.baslik);
    return [
      acilisSahnesi(b, post, post.kisilikSorulari?.length ? `${post.kisilikSorulari.length} soru` : "Kişilik testi"),
      ...(sonuclar.length ? [sonuclarSahnesi(b, sonuclar)] : []),
      kapanisSahnesi("Testi çöz, sonucunu yorumlara yaz"),
    ];
  }
  return [acilisSahnesi(b, post, b.formatEtiketi), kapanisSahnesi("Devamı sitede")];
}

/** @returns Tam HTML belgesi ve toplam süre (ms). */
export function reelBelgesi(b: ReelBaglami, post: Post): { html: string; sureMs: number } {
  const sahneler = sahneleriKur(b, post);
  let t = 0;
  const bolumler: string[] = [];
  const ilerleme: string[] = [];
  sahneler.forEach((sahne, i) => {
    const sonMu = i === sahneler.length - 1;
    bolumler.push(sahneKabi(t, sahne.sure, i === 0, sonMu, sahne.html(t, sonMu)));
    ilerleme.push(`<i><b style="animation:${a("dol", sahne.sure, t, "linear")}"></b></i>`);
    t += sahne.sure - (sonMu ? 0 : GECIS_MS);
  });
  const sureMs = t;

  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><style>${fontFaceCss()}${CSS}</style></head><body>
    ${bolumler.join("\n")}
    <div class="ilerleme">${ilerleme.join("")}</div>
    <div class="vinyet"></div>
    <div class="gren" style="background-image:url('${b.grenDataUri}')"></div>
    <div class="son-karar" style="animation:${a("karar", 400, sureMs - 400, "ease-in")}"></div>
  </body></html>`;
  return { html, sureMs };
}
