# sosyektif.com — repo haritası

Onedio-tarzı içerik sitesi, ajanlarla otonom üretim. Detaylı plan: `PLAN.md` (312+ satır —
tamamını okumadan önce `grep -n "^#" PLAN.md` ile ilgili bölümü bul, sadece o aralığı `sed -n` ile oku).

## Dizinler
- `site/` — Astro statik site (Cloudflare Pages'e deploy edilir). Kendi `CLAUDE.md`'si var (dev sunucu, Astro dokümanları).
- `agents/src/` — üretim zinciri: `trend/` (konu bulma), `content/` (yazı üretimi + `prompts.ts`),
  `moderation/` (kalite/hakem kapısı), `image/`, `publish/`, `distribute/` (Telegram/Bluesky),
  `analytics/` (haftalık geri besleme), `orchestrator/` (`pipeline.ts` ana zincir; ayrıca
  `burc.ts`, `burcUyum.ts`, `tarihteBugun.ts` ayrı zincirler), `lib/` (`llmRouter.ts`, `state.ts` ortak).
- `worker/telegram-onay/` — Cloudflare Worker: Telegram onay butonları + `data/config.json` acil durdurma.
  Asıl tetikleyici dış cron-job.org (bkz. `wrangler.toml` yorumları), GitHub/Cloudflare cron'larına güvenilmiyor.
- `data/` — çalışma zamanı durumu: `config.json` (paused flag), `blocklist.json`, `category-weights.json`,
  `evergreen.json`, `published-index.json` (tekrar önleme), `rejected-topics.json`, `last-run.json`. **Üretilmiş/durum verisi — gözle incelemek gerekirse `grep`/`jq` ile ilgili anahtarı çek, tamamını okuma.**
- `.github/workflows/` — `pipeline.yml` (ana cron), `daily-report.yml`, `weekly-analytics.yml`, `burc.yml`, `burc-uyum.yml`.

## Komutlar
- Ajanlar: `cd agents && npm run pipeline` / `daily-report` / `weekly-analytics` / `burc` / `typecheck`
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
içerik şemasında `etiketler` alanı (sayfası yok — bkz. `PLAN.md` Bölüm 10 / S6).

## Diğer
- Dil: proje genelinde Türkçe (commit mesajları, içerik, değişken/dosya adları çoğunlukla Türkçe kavramlar).
- Sıfır maliyet kısıtı geçerli — yeni bir ücretli servis önermeden önce `PLAN.md` Bölüm 4/6'ya bak.
- Detaylı yol haritası ve karar gerekçeleri için önce `PLAN.md`, sonra kod.
