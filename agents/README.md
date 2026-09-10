# sosyektif ajanları

PLAN.md'de tanımlanan 7 ajanın kodu. Tüm ajanlar TypeScript + Node.js 22
üzerinde çalışır, `tsx` ile doğrudan (derleme adımı olmadan) çalıştırılır.

## Kurulum

```bash
cd agents
npm install
cp .env.example .env   # sonra .env'i doldur
```

`.env` dosyası **asla commit edilmez** (kök `.gitignore`'da). GitHub Actions'ta
aynı değerler repo **Settings → Secrets and variables → Actions** üzerinden
eklenir.

## Gerekli API anahtarları

`.env.example` dosyasında tam liste var. Özet:

| Anahtar | Nereden alınır | Zorunlu mu? |
|---|---|---|
| `GEMINI_API_KEY` | aistudio.google.com | Hayır (fallback zinciri var) ama önerilir |
| `MISTRAL_API_KEY` | console.mistral.ai | Hayır ama önerilir |
| `GROQ_API_KEY` | console.groq.com | Hayır ama önerilir |
| `CEREBRAS_API_KEY` | cloud.cerebras.ai | Hayır ama önerilir |
| `PEXELS_API_KEY` | pexels.com/api | Hayır (yoksa tipografik kapak kullanılır) |
| `UNSPLASH_ACCESS_KEY` | unsplash.com/developers | Hayır |
| `YOUTUBE_API_KEY` | Google Cloud Console | Hayır (o kaynak atlanır) |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_ADMIN_CHAT_ID` / `TELEGRAM_PUBLIC_CHANNEL_ID` | @BotFather | Bildirim/onay için önerilir |
| `BLUESKY_HANDLE` / `BLUESKY_APP_PASSWORD` | bsky.app → Settings → App Passwords | Hayır |
| `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ZONE_ID` | Cloudflare Dashboard | Sadece haftalık analitik için |
| `GOOGLE_SEARCH_CONSOLE_CREDENTIALS_JSON` | Google Cloud servis hesabı JSON'u (tek satıra sıkıştırılmış) | Sadece haftalık analitik için |

**En az bir LLM anahtarı olmadan pipeline hiçbir içerik üretemez** — Trend ve
Moderasyon Ajanı'nın kısımları çalışır ama İçerik Ajanı `NoProviderAvailableError`
fırlatır ve o aday atlanır.

## Komutlar

```bash
npm run pipeline          # Ana zincir: trend -> içerik -> moderasyon -> görsel -> yayın -> dağıtım
npm run daily-report      # Günlük özet (Telegram)
npm run weekly-analytics  # Kategori ağırlıklarını günceller (Telegram)
npm run typecheck         # tsc --noEmit
```

## Mimari

```
src/
├── lib/            Ortak modüller: LLM yönlendirici, Telegram, Bluesky,
│                   şemalar, slug, durum (data/*.json) okuma/yazma
├── trend/          Trend Ajanı — RSS kaynakları + evergreen havuz
├── content/        İçerik Ajanı — Wikipedia kaynak toplama + LLM üretimi
├── moderation/      Moderasyon Ajanı — kara liste, benzerlik, hakem model
├── image/          Görsel Ajanı — Pexels/Unsplash + tipografik kapak yedeği
├── publish/        Yayın Ajanı — site/src/content/posts'a Markdown yazma
├── distribute/     Dağıtım Ajanı — Telegram + Bluesky paylaşımı
├── analytics/      Analitik Ajanı — Cloudflare + Search Console geri beslemesi
└── orchestrator/   pipeline.ts (ana döngü) ve dailyReport.ts
```

Detaylı tasarım kararları ve riskler için repo kökündeki `PLAN.md`'ye bak.

## Onay akışı (Faz 1b/1c)

Moderasyon skoruna göre üç durum:

- **Skor ≥ `otomatikYayinEsigi`** (varsayılan 0.85): içerik `taslak: false`
  olarak yazılır, otomatik yayınlanır, Telegram'a bilgi mesajı gider.
- **`onayaDusEsigi` ≤ skor < `otomatikYayinEsigi`** (varsayılan 0.6-0.85):
  içerik `taslak: true` olarak yazılır (siteye çıkmaz), Telegram'a onay
  bildirimi gider. Onaylamak için dosyada `taslak: false` yapıp commit
  etmen yeterli.
- **Skor < `onayaDusEsigi`**: dosya yine de `taslak: true` yazılır ama
  admin'i meşgul eden bir bildirim gitmez (istersen `data/published-index.json`'dan
  takip edebilirsin).

Eşikleri `data/config.json`'dan ayarlayabilirsin.
