# sosyektif.com — Otonom İçerik Platformu: Final Plan

**Hedef:** onedio.com formatında (liste, "bunu bilmiyordun", quiz) içerik sitesini, minimum insan müdahalesiyle ajanlar tarafından üretip yayınlamak.
**Ana kısıt:** Zorunlu giderler hariç sıfır maliyet. Zorunlu olan ödenir (şu an sadece domain); "kolaylık" için ücretli servis kullanılmaz.
**Durum:** Site ve ajan zinciri çalışıyor (Faz 1c). Site özellikleri yol haritası Bölüm 10'da — içerik olgunlaşınca uygulanacak.
**Son güncelleme:** 2026-09-12

---

## 0. Önceki Plana Göre Düzeltmeler

| # | Önceki iddia | Gerçek durum | Etki |
|---|---|---|---|
| 1 | Gemini ücretsiz: 1500 istek/gün | Google, 7 Aralık 2025'te habersiz ~%90 kesinti yaptı (Flash ~20/gün). Flash-Lite hâlâ ~1000/gün ama **her an tekrar değişebilir** | Tek sağlayıcıya bağımlılık kabul edilemez → **çoklu LLM yönlendirici** (Bölüm 4) |
| 2 | Domain "zaten sahipsin" | Sadece boş olduğu kontrol edildi, **satın alınmadı** | Tek maliyet kalemi: ~$10.44/yıl (1 Kasım 2026'dan itibaren $11.15) |
| 3 | Plausible Cloudflare Pages'te çalışır | Çalışmaz (sunucu + PostgreSQL + ClickHouse ister) | Cloudflare Web Analytics + Search Console kullanılacak |
| 4 | Buffer/Zapier ücretsiz katman | Gereksiz aracı, kısıtlı | Plandan çıkarıldı; resmi ücretsiz API'ler kullanılacak |

---

## 1. Önümüzdeki Sorunlar ve Çözümleri (Risk Kaydı)

Planın geri kalanı bu risklere göre şekillendi. Önem sırasına göre:

### 🔴 Kritik

**R1 — Google "Scaled Content Abuse" cezası**
Mart 2026 core update'i, editör denetimi olmadan toplu AI içerik basan siteleri doğrudan hedef aldı (%50-80 trafik kaybı raporları). "Günde 5+ otomatik içerik" tam bu profil. Google AI içeriği değil, **değer katmayan toplu içeriği** cezalandırıyor.
→ **Çözüm:** Kalite kapıları (Bölüm 3.3), her içerikte kaynaklar bölümü, konu çeşitliliği, kademeli hacim artışı (Bölüm 7), yazar/editoryal politika sayfaları (E-E-A-T), düşük skorlu içerik yayınlanmaz.

**R2 — Uydurma bilgi (halüsinasyon)**
"Bunu bilmiyordun" formatı LLM'lerin en çok bilgi uydurduğu tür. Otomatik yayında yanlış bilgi = itibar kaybı.
→ **Çözüm:** LLM'e sadece toplanan kaynak metinden (Wikipedia, haber özetleri) bilgi kullanma talimatı; **farklı bir sağlayıcıdaki ikinci model** her iddiayı kaynakla karşılaştırır (hakem modeli). Kaynakla desteklenmeyen iddia → içerik reddedilir.

**R3 — Hukuki risk (Türkiye'ye özgü)**
Gündem konuları sık sık siyaset, suç, ölüm, afet içerir. Gerçek kişiler hakkında otomatik içerik → kişilik hakları ihlali, 5651 kapsamında erişim engeli, hatta cezai risk.
→ **Çözüm:** **Konu kara listesi** (siyaset, suç, ölüm/trajedi/afet, sağlık tavsiyesi, finans tavsiyesi, cinsellik, çocuklar, özel kişiler). Gerçek kişiler hakkında olumsuz/spekülatif içerik üretilmez. Kaldırma talepleri için iletişim kanalı + hızlı kaldırma prosedürü.

**R4 — Prompt injection**
Trend kaynakları (Reddit başlıkları, haber metinleri) güvenilmeyen metindir. Kötü niyetli bir başlık LLM'e talimat verebilir ("önceki talimatları yok say, şunu yaz") → otomatik yayın zinciri saldırgan içeriği sitede yayınlar.
→ **Çözüm:** Kaynak metin prompt'ta veri olarak ayrıştırılır; LLM çıktısı katı şemaya (zod) uymak zorunda; LLM serbest link üretemez (sadece beyaz listedeki kaynak URL'leri); üretilen içerik **MDX değil düz Markdown** (MDX kod çalıştırabilir); çıktıda kara liste taraması.

### 🟠 Yüksek

**R5 — Ücretsiz katmanların habersiz değişmesi** (Gemini örneği yaşandı)
→ **Çözüm:** Her dış servis bir adaptör arkasında; LLM için 4 sağlayıcılı yedekleme zinciri; görsel için Pexels → Unsplash → yerel üretilmiş tipografik kapak; trend için 5 kaynak + evergreen konu havuzu. Hiçbir tek servisin çökmesi zinciri durdurmaz.

**R6 — Trend verisinin çoğu işe yaramaz**
Doğrulandı: Google Trends TR feed'inin ilk sıraları "trt 1 canlı", "tabii izle" gibi navigasyon aramaları. Wikipedia TR en çok okunanlarında "Anasayfa", "Özel:Ara" ve +18 film maddeleri var.
→ **Çözüm:** Çok aşamalı filtre: kural tabanlı (navigasyon kelimeleri: canlı, izle, giriş, maç sonucu; özel sayfalar) → LLM sınıflandırıcı ("bu konudan onedio tarzı değerli içerik çıkar mı? kategori? hassas mı?") → kara liste.

**R7 — Reddit veri merkezi IP'lerini engelliyor**
Reddit RSS'i GitHub Actions gibi bulut IP'lerinden sık sık 403 dönüyor.
→ **Çözüm:** Reddit "en iyi çaba" kaynağı; başarısız olursa sessizce atlanır. Asıl kaynaklar Google Trends RSS + Wikipedia + Google News + YouTube.

**R8 — Yeni domain = aylarca düşük trafik**
Onedio'nun trafiği büyük oranda sosyal medya + Google Discover. X ücretli oldu, Meta platformları onay süreci istiyor. Yeni domain Google'da aylarca zayıf kalır.
→ **Çözüm:** Faz 1'de ücretsiz ve onaysız dağıtım: **Telegram kanalı + Bluesky**. Faz 2'de Threads + Instagram + Facebook (tek Meta uygulamasıyla; Türkiye Threads'in en büyük pazarlarından). Discover için 1200px+ görsel + `max-image-preview:large`. Bing/Yandex için IndexNow (Yandex Türkiye'de ciddi pay sahibi). **Beklenti:** ilk 2-3 ay trafik düşük olacak, bu normal.

### 🟡 Orta

**R9 — Cloudflare Pages ücretsiz limitleri:** ayda 500 build, site başına 20.000 dosya, 20 dk build süresi.
→ **Çözüm:** Her cron çalışması içerikleri toplu commit eder (tek build) → ayda ~180 build. İçerik başına ~3 dosya (sayfa + tek optimize WebP + OG) → ~6.000 içerik ≈ günde 5'le **~3 yıl**. Görseller üretimde optimize edilir, Astro build'de yeniden işlemez (build hızlı kalır). Limite yaklaşınca görseller harici depolamaya taşınır (o zaman gelir olacak).

**R10 — Stok görsellerin konuyla alakasızlığı + kişilik hakları**
Gündem konuları belirli kişiler/olaylar hakkında; Pexels'te bunlar yok. Stok fotoğraftaki gerçek bir insanın skandal haberinde kullanılması Pexels lisansını ihlal eder ve hukuki risk yaratır.
→ **Çözüm:** Kişi/olay konularında **yerel üretilen tipografik kapak** (marka renkleri + başlık, satori ile; lisans riski sıfır). Pexels sadece nesne/mekan/kavram görselleri için, insan içermeyen görseller tercih edilir. Pexels API şartı gereği site altbilgisinde "Photos provided by Pexels" linki + içerikte fotoğrafçı kredisi.

**R11 — GitHub Actions cron gecikmesi:** yoğunlukta 15+ dk gecikme, nadiren atlanma.
→ **Çözüm:** Tam saat yerine tek dakikalar (örn. :17), `concurrency` grubu ile üst üste binen çalışmalar engellenir, manuel tetikleme (`workflow_dispatch`) her zaman açık. İçerik sitesi için dakika hassasiyeti gerekmez.

**R12 — Sessiz arızalar:** zincir "başarılı" çalışır ama çöp üretir ya da hiç üretmez.
→ **Çözüm:** Günlük Telegram özet raporu (yayınlanan/reddedilen/bekleyen/kota kullanımı); 24 saat yayın yoksa alarm; ardışık 3 başarısız çalışmada **otomatik duraklatma** + alarm; manuel **acil durdurma anahtarı** (`data/config.json` → `paused: true`).

**R13 — Türkçe karakterler / içerik tekrarı**
→ **Çözüm:** Türkçe slug dönüşümü (ç→c, ğ→g, ı→i, ö→o, ş→s, ü→u); yayınlanmış konuların parmak izi dizini ile kendi içeriğimizin tekrarı engellenir.

**R14 — Cloudflare KV ücretsiz katman yazma limiti (günde ~1.000 yazma)**
Bölüm 10'daki etkileşim özellikleri (oylama, tepki, tamamlanma sayacı) olay başına KV yazarsa limit ilk yüz ziyaretçide dolar ve sayaçlar sessizce durur.
→ **Çözüm:** Olay başına yazma yok; `gun:slug:olay` anahtarlarında gün içinde biriktirme, sayfa görüntülemenin Web Analytics'ten okunması, limite yaklaşınca Telegram alarmı (bkz. Bölüm 10 / S1).

---

## 2. Teknik Mimari

### 2.1 Neden WordPress değil (teyit edildi)
Ücretsiz WordPress hosting: 300MB-1GB depolama, 5-10GB/ay trafik, CPU kısıtlaması, otomatik yedek yok. Otomatik yayın için güvenilmez. Yerine:

- **Site:** Astro (statik) — quiz gibi interaktif bileşenler için "island" desteği
- **Hosting:** Cloudflare Pages — statik dosyalar için sınırsız trafik, 0 TL, otomatik SSL
- **Yayın = git commit:** Ajan içeriği repo'ya yazar → Cloudflare otomatik build/deploy eder
- **Dil:** Tüm proje **TypeScript** (site + ajanlar tek ekosistem, veri şemaları ortak)

### 2.2 Repo yapısı
```
sosyektif/
├── site/                      # Astro sitesi
│   ├── src/content/posts/     # Ajanların ürettiği .md içerikler
│   ├── src/components/        # Liste, Quiz, Kart vb.
│   └── public/images/         # Optimize edilmiş kapaklar (WebP)
├── agents/                    # Ajan kodları
│   └── src/
│       ├── trend/  content/  moderation/  image/
│       ├── publish/  distribute/  analytics/
│       └── lib/               # llm-router, telegram, şemalar, slug, durum
├── data/
│   ├── config.json            # Acil durdurma, hacim, eşikler
│   ├── blocklist.json         # Konu/kelime kara listesi
│   ├── evergreen.json         # Trend yokken kullanılacak konu havuzu
│   └── published-index.json   # Tekrar önleme dizini
├── .github/workflows/
│   ├── pipeline.yml           # Ana zincir (cron)
│   └── daily-report.yml       # Günlük özet
└── PLAN.md
```

### 2.3 Repo: herkese açık (`flanagans1989/sosyektif`)
**Avantaj:** Sınırsız ücretsiz Actions dakikası. Bu sayede build'i de GitHub Actions'ta yapıp `wrangler` ile doğrudan Cloudflare'e yüklemek mümkün, yani Cloudflare'in ayda 500 build limiti ve 20 dk build süresi sınırı devre dışı kalır.

**Açık repo nedeniyle zorunlu önlemler:**
- **Hiçbir API anahtarı repo'ya yazılmaz.** Hepsi GitHub Secrets'ta durur; `.env` dosyaları `.gitignore`'da olur; ilk commit'ten önce gizli bilgi taraması yapılır.
- Fork'lardan açılan PR'lar secret'lara erişemez (GitHub varsayılanı). Workflow'lar `pull_request_target` kullanmaz.
- **Reddedilen içerik asla commit edilmez.** Onay bekleyen içerik PR olarak açık kalır. Kabul edilebilir, çünkü önizleme linkleri zaten herkese açık.
- Kara liste ve prompt'lar görünür olur. Filtreyi atlatmaya çalışan biri ne arandığını görebilir, bu yüzden hakem model ve çıktı taraması ikinci savunma hattı olarak kalır.
- GitHub, 60 gün aktivite olmayan açık repolarda zamanlanmış workflow'ları kapatır. Bot her gün commit attığı için sorun olmaz, ama yayın uzun süre durursa bu risk günlük rapora eklenir.

---

## 3. Ajanlar

```
Orkestratör (GitHub Actions cron, günde ~6 kez)
 │  config.json kontrol → duraklatılmışsa çık
 ▼
1. Trend Ajanı ──── 5 kaynak + evergreen havuz → filtre → sıralı konu listesi
 ▼
2. İçerik Ajanı ─── kaynak toplama (Wikipedia/haber) → format seçimi → yapılandırılmış içerik
 ▼
3. Moderasyon Ajanı ─ kara liste → benzerlik → hakem model → kalite skoru
 │     ├── skor yüksek  → otomatik devam
 │     ├── skor orta    → PR aç + Telegram'a onay bildirimi (önizleme linkiyle)
 │     └── skor düşük   → reddet, konuyu işaretle
 ▼
4. Görsel Ajanı ──── Pexels / tipografik kapak → WebP 1200×675 + OG
 ▼
5. Yayın Ajanı ───── toplu commit → Cloudflare build → IndexNow ping
 ▼
6. Dağıtım Ajanı ─── Telegram kanalı + Bluesky (Faz 2: Threads/IG/FB)
 ▼
7. Analitik Ajanı ── (haftalık) Cloudflare + Search Console → kategori ağırlıkları
```

### 3.1 Trend Ajanı
| Kaynak | Erişim | Not |
|---|---|---|
| Google Trends TR RSS | Ücretsiz, auth yok | Doğrulandı; her trende bağlı 3-4 haber linki içeriyor |
| Wikipedia TR en çok okunanlar | Wikimedia resmi API, ücretsiz | Doğrulandı; aynı zamanda bilgi kaynağı |
| Google News RSS (TR, kategori bazlı) | Ücretsiz | Eğlence, bilim, teknoloji, spor |
| YouTube Trending (TR) | YouTube Data API, 10.000 birim/gün ücretsiz | Çağrı başına 1 birim |
| Reddit RSS | Ücretsiz, en iyi çaba | 403 riski — başarısızsa atlanır |
| Evergreen havuzu | Yerel dosya | Trend yoksa/hepsi elenirse; uzun ömürlü SEO içeriği |

**Karışım hedefi:** ~%60 gündem / ~%40 evergreen (evergreen içerik yıllarca trafik getirir, gündem içeriği birkaç gün).

**Filtre zinciri:** kural tabanlı eleme → LLM sınıflandırma (değer, kategori, hassasiyet, format önerisi) → kara liste → tekrar kontrolü → skorlama.

### 3.2 İçerik Ajanı
- Konu için kaynak metin toplar (Wikipedia maddesi TR+EN, haber başlık/özetleri)
- Formatı seçer: **Liste** / **Bunu Bilmiyordun** / **Quiz**
- Çıktı: katı JSON şeması (başlık, SEO başlığı, meta açıklama, gövde maddeleri, quiz soruları, kategori, etiketler, kullanılan kaynaklar) → zod ile doğrulanır, geçersizse yeniden dener
- Stil rehberi: samimi, esprili, onedio tonu — ama yanıltıcı clickbait yok (Google politikası)
- Her içeriğin sonunda **Kaynaklar** bölümü (Wikipedia için CC BY-SA atfı zorunlu)

### 3.3 Moderasyon/Kalite Ajanı
Sırayla, ilk başarısızlıkta durur:
1. **Kara liste** — konu ve çıktı metninde (hassas kategoriler, küfür, kişi adı + olumsuz bağlam)
2. **Benzerlik** — kaynak metinle n-gram örtüşmesi; eşiği aşarsa yeniden yazdırılır, yine aşarsa red
3. **Hakem model** — farklı sağlayıcıdaki model: "her iddia kaynakta var mı? başlık yanıltıcı mı? içerik değer katıyor mu?"
4. **Kalite skoru** — uzunluk, yapı, madde sayısı, quiz tutarlılığı
5. **Tekrar kontrolü** — yayınlanmış dizinle karşılaştırma

Skor → otomatik yayın / onaya düş / red.

### 3.4 Görsel Ajanı
- Kişi/olay konusu → **tipografik kapak** (yerel üretim, lisans riski yok)
- Nesne/mekan/kavram → Pexels (insan içermeyen tercih) → Unsplash yedek → tipografik kapak son yedek
- Çıktı: WebP 1200×675 (Discover için), OG görseli; Faz 2'de Instagram için JPEG 4:5
- Fotoğrafçı kredisi içeriğin frontmatter'ına yazılır

### 3.5 Yayın Ajanı
- Onaylanan içerikleri toplu tek commit'te yazar → Cloudflare build
- Onaya düşenler için ayrı branch + Pull Request → Cloudflare önizleme linki Telegram'a gider → **GitHub mobil uygulamasından merge = onay**
- Yayın sonrası: IndexNow ping (Bing + Yandex), sitemap otomatik güncellenir

### 3.6 Dağıtım Ajanı
| Platform | Faz | Maliyet | Not |
|---|---|---|---|
| Telegram kanalı | 1 | 0 | Bot API, onay süreci yok |
| Bluesky | 1 | 0 | Açık API, onay süreci yok |
| Threads | 2 | 0 | Günde 250 post limiti, Meta uygulaması gerekir |
| Instagram | 2 | 0 | Professional hesap + Meta uygulaması; kendi hesabı için tester rolüyle review gerekmez |
| Facebook Sayfası | 2 | 0 | Aynı Meta uygulaması |
| X (Twitter) | — | **Ücretli** | 2026'da ücretsiz katman kalktı; bütçe olursa eklenir |

**Bilinen sorun (2026-09-12'de tespit edildi, düzeltmesi bilerek ertelendi — henüz yeterli içerik hacmi yok):**
`distributeContent` yalnızca **otomatik yayınlanan** içerikte çağrılıyor. Telegram'dan elle
onaylanan içerikler (şu ana kadarki yayınların çoğu) hiçbir kanala dağıtılmıyor — onay Worker'ı
(`worker/telegram-onay`) sadece `taslak: false` yapıp commit atıyor, dağıtımı tetiklemiyor.
Ayrıca `TELEGRAM_PUBLIC_CHANNEL_ID` secret'ı hiç ayarlanmamış, yani otomatik yayınlanan içerikte
bile Telegram kanal paylaşımı sessizce atlanıyor (yalnızca Bluesky çalışıyor). Düzeltme: (1) herkese
açık Telegram kanalı aç + secret'ı ekle, (2) onay Worker'ı, GitHub Actions'ta küçük bir
"onaylananı dağıt" workflow'unu tetiklesin (Worker'ın zaten `Actions: write` yetkisi var).

### 3.7 Analitik Ajanı (haftalık)
- Cloudflare Web Analytics (cookie'siz, ücretsiz) → GraphQL API ile sayfa bazlı görüntülenme
- Google Search Console API → sorgu, tıklama, CTR
- Çıktı: kategori/format ağırlıkları güncellenir → Trend Ajanı bir sonraki hafta buna göre seçer
- Haftalık performans özeti Telegram'a

---

## 4. LLM Yönlendirici (Çoklu Sağlayıcı)

Tek sağlayıcı riski (R5) nedeniyle tüm LLM çağrıları tek bir yönlendiriciden geçer:

| Sıra | Sağlayıcı | Ücretsiz limit (değişebilir) | Rol |
|---|---|---|---|
| 1 | Gemini Flash-Lite | ~1.000 istek/gün | Birincil üretim (Türkçe iyi) |
| 2 | Mistral (Experiment) | 1 istek/sn, ~1 milyar token/ay | Yedek üretim + hakem |
| 3 | Groq | Model başına ~1.000 istek/gün | Yedek |
| 4 | Cerebras | ~1 milyon token/gün | Son yedek |

- 429 (kota) hatasında otomatik sonraki sağlayıcıya geçer, günlük kullanım sayılır
- **Hakem model üreticiden farklı sağlayıcıdan seçilir** (aynı modelin kendi hatasını onaylamasını engeller)
- İçerik başına ~3-4 çağrı → günde 10 içerik ≈ 40 çağrı. Gemini tamamen kesilse bile Mistral tek başına yeter.
- **Kurulumda Türkçe kalite testi:** aynı 3 konu her sağlayıcıyla üretilir, sen karşılaştırıp sıralamayı onaylarsın.
- Not: Ücretsiz katmanlarda gönderilen veriler model eğitimi için kullanılabilir — içerik zaten herkese açık yayınlanacağı için sorun değil, ama **API anahtarı dışında gizli veri gönderilmez**.

---

## 5. Hukuki ve Politika Gereklilikleri

- **Künye/İletişim sayfası (5651 md. 3):** Tanıtıcı bilgiler ana sayfadan ulaşılabilir "İletişim" başlığı altında bulunmalı; aykırılıkta 2.000-50.000 TL idari para cezası. *Hangi bilgilerin gerektiği kişi/şirket statüsüne göre değişir — yayına almadan önce bir hukukçuya teyit ettirmen önerilir.*
- **Gizlilik politikası / KVKK aydınlatma metni** — Faz 1'de form ve çerez yok, metin kısa tutulabilir
- **Editoryal politika sayfası** — içeriklerin AI destekli üretildiği ve nasıl denetlendiği (şeffaflık + E-E-A-T)
- **İçerik kaldırma prosedürü** — iletişim e-postası; gelen talep Telegram'a düşer; kaldırma = dosyayı silip commit (dakikalar sürer)
- **Atıflar:** Wikipedia (CC BY-SA), Pexels (site altbilgisi + fotoğrafçı kredisi)
- **Kara liste konuları:** siyaset, suç, ölüm/trajedi/afet, sağlık tavsiyesi, finans tavsiyesi, cinsellik, çocuklar, özel kişiler

---

## 6. Maliyet

| Kalem | Maliyet |
|---|---|
| **Domain (sosyektif.com, Cloudflare Registrar)** | **~$10.44/yıl** — 1 Kasım 2026'dan itibaren $11.15. WHOIS gizliliği dahil. Kart gerekir. |
| Hosting (Cloudflare Pages) | 0 |
| Orkestrasyon (GitHub Actions, özel repo) | 0 (2.000 dk/ay içinde) |
| LLM (4 sağlayıcı ücretsiz katman) | 0 |
| Görsel (Pexels/Unsplash/yerel) | 0 |
| Trend verisi | 0 |
| Bildirim + dağıtım (Telegram, Bluesky, Meta) | 0 |
| Analitik (Cloudflare + Search Console) | 0 |

**Toplam: yılda ~$10.44 (sadece domain).**
Alternatif: `sosyektif.pages.dev` ile tamamen ücretsiz başlanabilir, ama sonradan domain'e geçişte biriken SEO değeri kısmen kaybolur ve domain o arada başkası tarafından alınabilir. **Domain'i baştan almak önerilir.**

---

## 7. Yol Haritası

### Faz 0 — Hazırlık (1-2 gün, senin yapman gerekenler)
Otomatikleştirilemeyen, hesap/kimlik gerektiren adımlar:
- [x] Cloudflare hesabı + **sosyektif.com satın alma** (1 Kasım'dan önce)
- [x] GitHub: hangi hesap kullanılacak kararı + özel repo — `flanagans1989/sosyektif`
- [x] API anahtarları: Google AI Studio (Gemini), Mistral (telefon doğrulaması ister), Groq, Cerebras, Pexels, YouTube Data API — tümü GitHub Secrets'ta
- [x] Telegram: BotFather ile bot + özel onay sohbeti
- [ ] Telegram: **herkese açık kanal** — bot ve onay sohbeti çalışıyor ama `TELEGRAM_PUBLIC_CHANNEL_ID` secret'ı hiç ayarlanmamış; kanal ya hiç açılmadı ya da açıldıysa bağlanmadı. Onaylanan içeriklerin dağıtımı bu yüzden çalışmıyor (2026-09-12'de tespit edildi, düzeltmesi bilerek ertelendi — bkz. Bölüm 3.6 notu)
- [x] Bluesky hesabı + uygulama şifresi — `sosyektif.bsky.social`, aktif
- [~] Künye için iletişim bilgileri — `/iletisim` sayfası var (site adı + e-posta) ama 5651 md. 3'ün tam gerektirdiği bilgiler (adres, gerçek/tüzel kişi kimliği) hukukçu teyidi bekliyor (bkz. Bölüm 5)

### Faz 1a — Site iskeleti
- Astro kurulumu, onedio tarzı tasarım (kart ızgarası, kategoriler, makale, liste ve quiz bileşenleri)
- Yasal sayfalar, SEO temeli (sitemap, JSON-LD, OG, robots, RSS)
- Cloudflare Pages + domain bağlantısı
- Elle yazılmış 3-5 örnek içerikle yayına alma
- Search Console, Bing Webmaster, Yandex Webmaster kayıtları

### Faz 1b — Ajanlar "prova modunda" (1-2 hafta)
- Tüm ajanlar çalışır ama **her içerik onaya düşer** (otomatik yayın kapalı)
- Hacim: günde 2-3
- Amaç: prompt'ları, filtreleri ve skor eşiklerini senin onay/red kararlarına göre ayarlamak
- LLM Türkçe kalite testi burada yapılır

### Faz 1c — Skor bazlı otomatik yayın
- Yüksek skorlu içerikler otomatik yayınlanır, orta skorlular onaya düşer
- Hacim kademeli olarak **günde 5+**'ya çıkar (kalite metrikleri iyi gittikçe)
- Telegram kanalı + Bluesky dağıtımı açılır
- Günlük rapor + alarm + otomatik duraklatma aktif

### Faz 2 — Büyüme
- Meta entegrasyonu (Threads, Instagram, Facebook)
- Analitik geri besleme döngüsü aktif
- Telegram'dan tek tık onay butonları (Cloudflare Worker, ücretsiz katman)
- **Site özellikleri (Bölüm 10):** kapı koşulları sağlandığında S1'den başlanır — ölçüm/geri besleme, oylama, paylaşılabilir sonuç kartı, mobil format, keşif, güven katmanı

### Faz 3 — Ölçek ve gelir
- Reklam/gelir modeli (AdSense başvurusu belirli içerik olgunluğu ister; hazırlığı Bölüm 10 / S8)
- Dosya limitine yaklaşılırsa görsellerin harici depolamaya taşınması
- Bütçe olursa X dağıtımı

---

## 8. Ortam Kontrolü (2026-09-10)
- Node.js v24.18.0, npm 11.16.0, git 2.54.0, gh 2.96.0 — kurulu ✓
- gh oturumu: `flanagans1989` (aktif), `studiominhagen` — repo için hangisi kullanılacak karar bekliyor

---

## 9. Kararlar
1. ✅ Domain alınacak (zorunlu gider — Cloudflare Registrar, 1 Kasım 2026'dan önce)

2. ✅ Repo: herkese açık, `flanagans1989` hesabı (önlemler Bölüm 2.3'te)
3. ✅ Hacim: kademeli. Faz 1b prova modu (günde 2-3, hepsi onaylı), ardından Faz 1c'de 5+
4. ✅ Konu kara listesi (Bölüm 5) olduğu gibi onaylandı

Tüm kararlar alındı; plan uygulamaya hazır.

---

## 10. Site Özellikleri Yol Haritası (Faz 2.5 — içerik olgunlaştıkça)

Bu bölümdeki özellikler **şimdi yapılmaz.** Otonom zincirin asıl işi içerik üretmek; bu özelliklerin
hiçbiri içerik azken değer üretmez (boş bir sitede "en çok okunanlar" da, oylama da anlamsızdır).
Aşağıdaki kapı açıldığında, **sırayla ve tek tek** uygulanır.

### 10.0 Başlama kapısı
Hepsi sağlandığında S1'e başlanır:
- [ ] En az **~150 yayınlanmış içerik** (günde 5 ile ~1 ay)
- [ ] Search Console'da indekslenmiş sayfa oranı **> %70**
- [ ] Günlük **en az ~100 ziyaret** (ölçüm için anlamlı taban; altında veri gürültüden ayrılmaz)
- [ ] Faz 1c istikrarlı: 2 hafta boyunca otomatik duraklatma tetiklenmemiş

Kapı açılmadan tek istisna **S7 (güven katmanı)**: o, trafikten bağımsız olarak R1/R3 savunması
olduğu için gerekirse sıradan öne alınabilir.

**2026-09-12 güncellemesi:** Kullanıcı isteğiyle kapı beklenmeden S3-S8'e (S2 hariç) başlandı —
büyük kısmı zaten kodda mevcuttu ya da dış hesap gerektirmeden tamamlanabildi. Aşağıdaki tabloda
gerçek durum işaretli. Bu, "kapı erken açıldı" demek değil — kapı hâlâ geçerli, ama kapıyı beklemek
zorunda olmayan (trafik/hacimden bağımsız, salt mühendislik) kısımlar öne alındı.

### 10.1 Sıra ve gerekçe
Sıra keyfi değil: S1 sisteme **göz** verir (ajan neyin tuttuğunu öğrenir), S2-S3 **bedava dağıtım**
sağlar, S4-S6 oturumu uzatır, S7 cezaya karşı sigortadır, S8 geliri hazırlar.
Her adım bitip **1 hafta veriyle doğrulandıktan sonra** bir sonrakine geçilir; aynı anda iki adım açılmaz.
(Bu kural S2'nin KV'si hazır olup açıldığında yeniden geçerli olacak — S3-S8 istisnai olarak birlikte yapıldı.)

| # | Adım | Bağımlılık | Durum |
|---|---|---|---|
| S1 | Ölçüm → ajana geri besleme | — | ✅ Sayfa görüntüleme + Search Console geri beslemesi zaten koddaymış (fark edilmemiş). ⏳ Etkileşim sayaçları (oy/tepki) S2'nin KV'sini bekliyor |
| S2 | Oylama/anket + tepki barı | S1 (aynı KV) | ✅ Tepki barı + KV altyapısı tamamlandı. 🚫 Anket formatı bilerek yapılmadı (üretim pipeline riski) |
| S3 | Quiz/test sonuç kartı + skor OG | — | ✅ Zaten tamamlanmıştı (canvas tabanlı `sonucKarti.ts`, "meydan oku" linki, WhatsApp paylaşımı) — plandan daha iyi bir çözümdü |
| S4 | Mobil kaydırmalı kart + sonsuz akış | — | ✅ Okuma ilerleme çubuğu + mobil kaydırmalı kart (2026-09-12). Gerçek "sonsuz akış" bilinçli olarak yapılmadı (bkz. altı) |
| S5 | Alışkanlık: seri + bülten | — | ✅ Seri (streak) zaten tamamlanmıştı (`gunun-sorusu`). 🚫 Bülten **bloke** — e-posta servisi hesabı gerekiyor |
| S6 | Keşif: etiket, en çok okunanlar, seriler | S1 (en çok okunanlar için) | ✅ Etiket sayfaları + en çok okunanlar (2026-09-12). ⏸️ Seri/dosya alanı yapılmadı (düşük öncelik) |
| S7 | Güven katmanı (E-E-A-T + hukuki) | — | ✅ Tamamlandı (2026-09-12): görünür tarih/dateModified, düzeltme kaydı + `/duzeltmeler`, bildirim formu → Telegram. Künye hâlâ hukukçu teyidi bekliyor (Bölüm 5) |
| S8 | Gelir hazırlığı | S1..S6 | ✅ Reklam slotları eklendi, `REKLAM_AKTIF=false` ile kapalı (2026-09-12) |

---

### S1 — Kendi ölçümü ve ajana geri besleme
**Durum (2026-09-12): kısmen tamamlandı.** Sayfa görüntüleme (Cloudflare) + Search Console
geri beslemesi zaten `agents/src/analytics/` içinde kodluymuş, plan yazılırken fark edilmemişti.
Eksik kalan tek parça: etkileşim sayaçları (S2 ile aynı KV'yi bekliyor).

**Amaç:** Ajanlar şu an konu seçerken hangi içeriğin tuttuğunu bilmiyor. Bu döngü kurulmazsa sistem
yıllarca aynı körlükte içerik basar. Bölüm 3.7'deki Analitik Ajanı'nın eksik kalan ayağı budur.

**Ne yapılır**
- **Sayfa görüntüleme / arama performansı:** Cloudflare Web Analytics GraphQL API + Search Console API
  (zaten planda, Bölüm 3.7). Yeni altyapı gerekmez, sadece ajan tarafı yazılır.
- **Etkileşim olayları:** mevcut `worker/telegram-onay` Worker'ına bir KV namespace (`METRIKLER`) ve
  `POST /olay` uç noktası eklenir. Olay türleri: `tamamlandi` (yazının sonuna gelindi),
  `quiz_bitti`, `oy`, `tepki`.
- **Yazma limiti kısıtı (bkz. R14):** KV ücretsiz katmanı **günde ~1.000 yazma** verir. Bu yüzden
  olay başına yazma **yapılmaz**; anahtar `gun:slug:olay` biçiminde tutulur ve gün içinde
  biriktirilir → yazma sayısı "o gün etkileşim alan içerik sayısı" kadar olur (günde 5 içerikle
  rahat sığar). Sayfa görüntüleme sayacı KV'ye **hiç** yazılmaz, o Web Analytics'ten gelir.
- **Geri besleme:** Analitik Ajanı haftalık çalışır → `data/performance.json` üretir →
  `data/category-weights.json` ve format ağırlıklarını günceller → Trend Ajanı bir sonraki hafta
  buna göre seçer. Ağırlık değişimi **tek seferde en fazla ±%20** ile sınırlanır (tek haftalık
  gürültünün konu havuzunu bozmasını engeller).
- **Gizlilik:** çerez yok, IP saklanmaz, kullanıcı kimliği yok — yalnızca sayaç. KVKK açısından
  gizlilik politikasına tek paragraf eklenir.

**Bitti kriteri:** Telegram'a düşen haftalık raporda "en iyi/en kötü 5 içerik + güncellenen
ağırlıklar" görünüyor ve `category-weights.json` en az bir kez otomatik değişmiş.

---

### S2 — Oylama / anket + tepki barı
**Durum: ✅ tepki barı tamamlandı (2026-09-12), 🚫 anket formatı bilerek yapılmadı.**
KV namespace'i (`sosyektif_metrikler`, deraksizolasyon hesabı, ID `fdb4338b9f094a2083dcb827207c2d80`)
oluşturuldu, Worker'a `METRIKLER` binding'i olarak bağlandı. `POST /tepki` ve
`GET /tepki-sonuc?slug=` uç noktaları canlı; her içeriğin altında 4 emoji tepki
(şaşırdım/güldüm/inanmadım/bilgilendim), localStorage ile çift oy engeli. Gerçek istekle
uçtan uca doğrulandı. **Yeni "anket" içerik formatı bilerek yapılmadı** — canlı otonom
içerik üretim pipeline'ının prompt'larına/şemasına dokunmayı gerektiriyor, bu risk şu an
değere değmiyor; tepki barı S2'nin asıl sinyal değerini zaten sağlıyor.

**Amaç:** Onedio'nun asıl motoru liste değil, **"sence?" oylaması**. Canlı yüzde sonucu
("%68'i seninle aynı düşünüyor") hem geri dönüş hem paylaşım üretir. giscus yorumları GitHub
hesabı istediği için sürtünmesi yüksek; tepki barı ise tek tıklık ve en iyi kalite sinyali.

**Ne yapılır**
- Yeni içerik formatı: **anket** (`format: anket`) — içerik şemasına (`site/src/content.config.ts`)
  eklenir, İçerik Ajanı'na prompt ve zod şeması yazılır.
- Her içeriğin altına **tepki barı**: şaşırdım / güldüm / inanmadım / bilgilendim.
- Oy ve tepki S1'deki aynı Worker + KV üzerinden; sonuçlar `GET /sonuc?slug=` ile okunur.
- Çift oy kontrolü localStorage ile (kesin değil, yeterli — amaç sinyal toplamak, seçim yapmak değil).
- **Kötüye kullanım:** slug başına dakikalık oran sınırı, yalnızca bilinen slug'lar kabul edilir
  (build'de üretilen slug listesi Worker'a verilir), gövde boyutu sınırı.

**Bitti kriteri:** Anket formatında en az 10 içerik yayında ve etkileşim oranı (oy/görüntüleme)
haftalık raporda izleniyor.

---

### S3 — Quiz/kişilik testi sonuç kartı + skora özel OG görseli
**Durum: ✅ zaten tamamlanmıştı.** `site/src/lib/sonucKarti.ts` canvas ile paylaşılabilir
kare kart çiziyor, `QuizIcerik.astro`/`KisilikTestiIcerik.astro` "meydan oku" linki (`?meydan=8-10`)
ve WhatsApp paylaşımıyla birlikte kullanıyor. Build-zamanı OG üretimi yerine bu (daha esnek,
herhangi bir skor için çalışıyor) — plan güncellendi, aşağıdaki "ne yapılır" artık tarihsel.

**Amaç:** Quiz ve kişilik testinin tek gerçek viral mekanizması, paylaşılabilir sonuçtur.
"18/20 doğru bildim" kartı bedava dağıtım demek.

**Ne yapılır**
- Sonuç URL'i: `/<slug>/?skor=4` — sonuç ekranı doğrudan paylaşılabilir olur.
- OG görseli **build sırasında önceden üretilir**: quiz 5-6 soruluk olduğu için olası her skor için
  (0..N) tek bir `satori` çıktısı yeterli. Site statik kaldığı için çalışma zamanında görsel
  üretmeye gerek yok — bu, dinamik OG'nin bütün karmaşasını ortadan kaldırır.
- Kişilik testinde aynı yaklaşım: her sonuç tipi için bir kart (`site/src/lib/sonucKarti.ts`
  zaten var, OG üretimiyle birleştirilir).
- Paylaş butonları (`ShareButtons.astro`) skorlu URL'i kullanacak şekilde güncellenir.

**Bitti kriteri:** Skorlu bir URL Telegram/Bluesky/WhatsApp önizlemesinde doğru kartı gösteriyor.

---

### S4 — Mobil format: kaydırmalı kartlar + sonsuz akış
**Durum: ✅ kısmen tamamlandı (2026-09-12).** Okuma ilerleme çubuğu ve mobilde (<640px)
yatay kaydırmalı kart görünümü (`ListeIcerik`, `TriviaIcerik`) canlı. Gerçek "sonsuz akış"
(sayfa sonunda bir sonraki içeriği DOM'a inline yükleme) bilinçli olarak yapılmadı — statik bir
Astro sitesinde kırılgan olurdu (hydration/analytics riski); `SiradakiIcerik.astro` zaten
tıkla-devam-et kartı sağlıyor.

**Amaç:** Trafiğin ~%85'i mobil olacak. Oturum süresini en çok etkileyen iki değişiklik.

**Ne yapılır**
- `ListeIcerik.astro` için ikinci bir görünüm: liste maddelerini **tek tek kaydırılan kart**
  (CSS scroll-snap, JS'siz çalışır; ilerleme göstergesi küçük bir island).
- Okuma ilerleme çubuğu (üstte ince şerit).
- `SiradakiIcerik.astro` sayfa sonunda **otomatik yüklenir** (IntersectionObserver + fetch) →
  sonsuz akış. Tarayıcı adresi `history.replaceState` ile güncellenir ki geri tuşu bozulmasın.
- Sonsuz akış yalnızca mobilde ve en fazla 3 içerik derinliğinde (sayfa ağırlığı ve Core Web
  Vitals bozulmasın).

**Bitti kriteri:** Web Analytics'te mobil ortalama oturum süresi ölçülebilir şekilde artmış
(karşılaştırma için S4 öncesi 1 haftalık taban kaydedilir).

---

### S5 — Alışkanlık: seri (streak) + bülten
**Durum: ✅ seri zaten tamamlanmıştı, 🚫 bülten bloke.** `gunun-sorusu` sayfasında
localStorage tabanlı seri takibi, Türkiye günü hesaplaması ve WhatsApp paylaşımı çalışıyor —
plan yazılırken fark edilmemişti. Bülten için e-posta servisi (Buttondown/MailerLite) hesabı
kullanıcı tarafından açılmayı bekliyor.

**Amaç:** `gunun-sorusu` var ama geri gelme sebebi yok. Yeni domain Google'da aylarca zayıf
kalacağı için (R8) doğrudan kanal kurmak zorunlu.

**Ne yapılır**
- **Seri:** "7 gün üst üste doğru bildin" — localStorage tabanlı, hesap gerekmez. Seri kartı
  paylaşılabilir (S3'teki OG altyapısı kullanılır).
- **Günlük bülten:** Telegram kanalı zaten var; e-posta için ücretsiz katmanlı bir servis
  (ör. Buttondown/MailerLite) — abonelik formu + günlük özetin otomatik gönderimi.
  Form eklendiği an **KVKK aydınlatma metni güncellenmek zorunda** (Bölüm 5'teki "Faz 1'de form ve
  çerez yok" varsayımı geçersiz olur).
- Bülten gönderimi Dağıtım Ajanı'na yeni bir adaptör olarak eklenir (Bölüm 3.6 deseni).

**Bitti kriteri:** 2 hafta üst üste otomatik bülten gitmiş, abone sayısı raporda izleniyor.

---

### S6 — Keşif
**Durum: ✅ büyük kısmı tamamlandı (2026-09-12).** Etiket sayfaları
(`/etiket/[etiket]/`) ve "Bu Hafta En Çok Okunanlar" (anasayfa, haftalık analitikten) canlı.
Seriler/dosyalar ("Uzay Dosyası" gibi) henüz yapılmadı — düşük öncelik, ayrı bir oturumda ele alınabilir.

**Amaç:** Kategori çok kaba bir kırılım; 500+ içerikte arşiv keşfedilmez hale gelir.

**Ne yapılır**
- **Etiket sayfaları:** `etiketler` alanı şemada **zaten var** ama sayfası yok →
  `site/src/pages/etiket/[etiket]/index.astro` + içerik altında etiket çipleri.
- **"Bugün/bu hafta en çok okunanlar":** S1'deki sayaçtan bedava gelir; ana sayfa ve kenar bloğu.
- **Seriler/dosyalar:** aynı konuyu sürdüren içerikleri bir koleksiyonda toplama (ör. "Uzay Dosyası").
  İçerik şemasına isteğe bağlı `seri` alanı; Trend Ajanı mevcut bir seriyi sürdürmeyi tercih edebilir.
- **Arama:** Pagefind zaten kurulu (`build` script'inde) — `ara/` sayfasında sonuç kalitesi,
  etiket/kategori filtresi ve boş sonuç davranışı gözden geçirilir.

**Bitti kriteri:** Etiket ve seri sayfaları sitemap'te ve Search Console'da indekslenmiş.

---

### S7 — Güven katmanı (E-E-A-T + hukuki) — trafikten bağımsız, gerekirse öne alınır
**Durum: ✅ tamamlandı (2026-09-12)**, künye hariç. Görünür yayın/güncelleme tarihi +
JSON-LD `dateModified`, `duzeltmeNotu` alanı + `/duzeltmeler` sayfası, `/iletisim`'de gerçek
bildirim formu (Worker'ın `/bildir` uç noktasına, Telegram admin sohbetine düşüyor). Künye hâlâ
Bölüm 5'teki hukukçu teyidini bekliyor.

**Amaç:** R1 (scaled content abuse) ve R3 (hukuki risk) karşısındaki en somut savunma.
Editoryal politika sayfası var; eksikleri tamamlanır.

**Ne yapılır**
- **Künye/yazar sayfası:** içeriği kimin ürettiği ve denetlediği, iletişim (5651 md. 3 zorunluluğu
  Bölüm 5'te; hukukçu teyidi hâlâ bekliyor).
- **Kaynaklar bölümü her içerikte görünür** — üretimde zaten toplanıyor, ama okuyucuya net
  gösterilmesi hem güven hem R2 savunması.
- **Yayın + güncelleme tarihi** her içerikte görünür ve JSON-LD'de (`dateModified`).
- **Düzeltme (errata) kaydı:** düzeltilen içeriğin altında "2026-10-03'te düzeltildi: ..." notu ve
  `/duzeltmeler` sayfası. Otomatik yayın yapan bir site için en güçlü iyi niyet göstergesi.
- **Düzeltme/kaldırma talep formu:** şu an yalnızca e-posta var; form → Telegram'a düşer
  (Bölüm 5'teki prosedürün kullanıcı tarafı).

**Bitti kriteri:** Künye, kaynaklar, `dateModified` ve `/duzeltmeler` yayında; kaldırma talebi
uçtan uca bir kez test edilmiş.

---

### S8 — Gelir hazırlığı
**Durum: ✅ tamamlandı (2026-09-12).** `ReklamAlani.astro` bileşeni + `REKLAM_AKTIF=false`
anahtarı — kapalıyken hiç DOM'a girmiyor, CWV etkisi sıfır.

**Ne yapılır**
- `Layout.astro`'ya **boş reklam slotları** (içerik üstü, içerik arası, kenar) şimdiden ayrılır ki
  sonradan tasarım bozulmasın; slotlar bir konfig anahtarıyla kapalı durur.
- AdSense başvurusu belirli içerik olgunluğu ister → S1..S6 bitip trafik istikrara kavuştuğunda.
- Reklam açıldıktan sonra Core Web Vitals yeniden ölçülür; LCP bozulursa slot kaldırılır
  (hız, bu sitenin tek rekabet avantajı).

**Bitti kriteri:** Slotlar yerinde, kapalı ve CWV etkisi ölçülmüş.

---

### 10.2 Bilinçli olarak sonraya bırakılanlar
| Özellik | Neden şimdi değil |
|---|---|
| Kullanıcı hesabı / giriş | Statik + sıfır maliyet kısıtını en çok zorlayan şey; trafik olmadan değeri yok |
| Kullanıcı içeriği gönderme (UGC) | Moderasyon yükü + hukuki sorumluluk; ajan zinciri oturmadan açılmaz |
| Web push bildirimi | Telegram + bülten aynı işi ücretsiz yapıyor; gereksiz servis bağımlılığı (R5) |
| A/B başlık testi | Statik sitede Worker gerektirir; anlamlı sonuç için mevcut trafiğin katı lazım |
| X (Twitter) dağıtımı | Ücretli (Bölüm 3.6) |
