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

Her aday için zincir: sınıflandırma (konu odağı) → Vikipedi TR+EN kaynağı →
taslak → moderasyon → gerekirse denetçi notlarıyla **1 revizyon turu** →
görsel → yayın/onay.

Moderasyon skoru = (0.6·doğruluk + 0.4·okur değeri) × (0.6 + 0.4·yapı).
Doğruluk ve değer hakem modelden (1-5), yapı deterministik kontrollerden gelir.

- **Sert red** (kara liste, tekrar konu, hassas içerik): revizyon denenmez,
  konu 7 gün tekrar denenmez (`data/rejected-topics.json`).
- **Skor ≥ `otomatikYayinEsigi`** (0.8) ve `provaModu: false`: `taslak: false`
  yazılır, siteye çıkar, Telegram/Bluesky'de paylaşılır.
- **`onayaDusEsigi` ≤ skor** (0.55) ya da prova modu açık: `taslak: true`
  yazılır (siteye çıkmaz); Telegram'a madde başlıkları, puanlar, denetçi notları
  ve GitHub düzenleme linkiyle onay bildirimi gider. Onaylamak için dosyada
  `taslak: false` yapıp kaydetmen yeterli.
- **Skor < `onayaDusEsigi`**: yazılmaz, konu 7 gün tekrar denenmez.

`provaModu: true` iken skor ne olursa olsun hiçbir şey otomatik yayınlanmaz.
Onayladığın içeriklerin kalitesinden emin olunca `data/config.json`'da
`provaModu: false` yap.
