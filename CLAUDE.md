# sosyektif.com — repo haritası

Onedio-tarzı içerik sitesi, ajanlarla otonom üretim. Detaylı plan: `PLAN.md` (312+ satır —
tamamını okumadan önce `grep -n "^#" PLAN.md` ile ilgili bölümü bul, sadece o aralığı `sed -n` ile oku).

## Dizinler
- `site/` — Astro statik site (Cloudflare Pages'e deploy edilir). Kendi `CLAUDE.md`'si var (dev sunucu, Astro dokümanları).
  `/ekodektif/` sitenin ekonomi alanı: canlı piyasa panosu + para çevirici (client-side, truncgil/CoinGecko —
  `PiyasaSeridi.astro` ile aynı anahtarsız kaynaklar) ve "ekonomi" kategorisindeki içerikler. Kendi logosu
  `EkodektifLogo.astro`, rengi `--color-eko` (global.css).
- `agents/src/` — üretim zinciri: `trend/` (konu bulma), `content/` (yazı üretimi + `prompts.ts`),
  `moderation/` (kalite/hakem kapısı), `image/` (kapak; `social.ts`+`socialSablon.ts` Instagram carousel,
  `reelSablon.ts`+`reelRender.ts` Reels videosu — HTML/CSS Chromium'da render, ffmpeg), `publish/`,
  `distribute/` (`kuyruk.ts` durum tabanlı dağıtım kuyruğu — tüm canlı içerik × Telegram/Bluesky/Threads/Instagram/Facebook,
  durum `data/dagitim.json`; `reel.ts` Reels onay+paylaşım → IG Reels/FB/YouTube Shorts),
  `saglik/kontroller.ts` (gözetim ajanının ~45 gerçek-durum kontrolü),
  `analytics/` (haftalık geri besleme + `socialPerformance.ts`), `orchestrator/` (`pipeline.ts` ana zincir;
  `saglikDenetimi.ts` gözetim/audit + otomatik onarım, `dailyReport.ts`, `sosyalPerformans.ts`; ayrıca `burc.ts`, `burcUyum.ts`, `tarihteBugun.ts`),
  `lib/` (`llmRouter.ts`, `state.ts`, `metaToken.ts`, `threads.ts`/`instagram.ts`/`facebook.ts`/`youtube.ts`, `dagitimDurumu.ts`).
- `agents/assets/` — `fonts/` (Poppins, OFL), `muzik/` (Reels müziği, yalnızca CC0 — lisanslar `muzik.json`'da).
- `worker/telegram-onay/` — Cloudflare Worker: Telegram onay butonları (içerik + Reels `reel_ok`/`reel_no`),
  Meta token KV'si (`/meta-token`, Threads/Instagram otomatik yenileme) + `data/config.json` acil durdurma.
  Asıl tetikleyici dış cron-job.org (bkz. `wrangler.toml` yorumları), GitHub/Cloudflare cron'larına güvenilmiyor.
  **Deploy:** wrangler bu hesaba bağlı değil — `dashboard-paste.js` (tsc çıktısı) Cloudflare panelinde Quick Edit'e yapıştırılır.
- `data/` — çalışma zamanı durumu: `config.json` (paused flag), `blocklist.json`, `category-weights.json`,
  `evergreen.json`, `published-index.json` (tekrar önleme), `rejected-topics.json`, `last-run.json`. **Üretilmiş/durum verisi — gözle incelemek gerekirse `grep`/`jq` ile ilgili anahtarı çek, tamamını okuma.**
- `.github/workflows/` — `pipeline.yml` (ana cron), `dagitim.yml` (sosyal medya kuyruğu, saatlik + pipeline/onay sonrası),
  `saglik-denetimi.yml` (6 saatte bir audit + onarım), `daily-report.yml`, `weekly-analytics.yml` (+ sosyal performans),
  `burc.yml`, `burc-uyum.yml`, `reel-onizle-telegram.yml` (elle: Reels'i onay butonlarıyla Telegram'a gönderir),
  `reel-paylas.yml` (Worker'ın ✅ butonu başlatır).

## Komutlar
- Ajanlar: `cd agents && npm run pipeline` / `dagit` / `saglik-denetimi` / `youtube-yetkilendir` / `daily-report` / `weekly-analytics` / `sosyal-performans` / `burc` / `typecheck`
- Görsel önizleme (paylaşmaz): `npm run slayt-onizle -- <slug>` (carousel), `npm run reel-onizle -- <slug> [--kareler]` (Reels)
- Marka görselleri: `npm run marka-gorselleri` (IG/Threads/FB profil+kapak), `npm run youtube-gorselleri` (YouTube profil+banner) — ikisi de elle üretilip elle yüklenir, API ile değiştirilemiyor
- Site: `cd site && npm run dev` (arkaplanda: `astro dev --background`, durum: `astro dev status`) / `npm run build` (Astro + Pagefind) / `npm run check`
- Worker: `cd worker/telegram-onay && npm run dev` / `npm run deploy` (wrangler)

## Asla tam okuma (token israfı)
- `**/package-lock.json` (yüzlerce KB) — bağımlılık sorusu için `npm ls <paket>` kullan.
- `**/node_modules/`, `site/dist/`
- `site/src/data/burc-uyum.json` (~64KB, üretilmiş burç eşleşme tablosu) — ilgili anahtarı `grep` ile çek.
- `data/published-index.json`, `data/rejected-topics.json` — büyüyen log dosyaları, `grep`/`tail` ile bak.
- Build/deploy komut çıktıları: `| tail -30` veya `| grep -E "error|warn"` ile kısalt, ham çıktıyı okuma.

## Zaten var — tekrar önerme/yeniden yazma
Pagefind arama (`build` script'inde kurulu), sitemap (`@astrojs/sitemap`), IndexNow (`agents/src/lib/indexnow.ts`),
giscus yorumları (GitHub Discussions tabanlı), Telegram onay Worker'ı, çoklu LLM yönlendirici (`llmRouter.ts`),
içerik şemasında `etiketler` alanı (sayfası yok — bkz. `PLAN.md` Bölüm 10 / S6),
Threads/Instagram/Facebook paylaşımı, Gözetim/Sosyal Performans/Reels ajanları (2026-09-13, `PLAN.md` 11.2, 11.6, 11.8, 11.9).

## Diğer
- Dil: proje genelinde Türkçe (commit mesajları, içerik, değişken/dosya adları çoğunlukla Türkçe kavramlar).
- Sıfır maliyet kısıtı geçerli — yeni bir ücretli servis önermeden önce `PLAN.md` Bölüm 4/6'ya bak.
- Detaylı yol haritası ve karar gerekçeleri için önce `PLAN.md`, sonra kod.
