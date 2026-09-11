/**
 * IndexNow — açık, hesap gerektirmeyen bir protokol. Yeni/güncellenen bir
 * URL'i tek bir POST isteğiyle bildirdiğinde Bing (ve destekleyen diğer
 * motorlar: Yandex, Seznam vb.) taramayı beklemeden hemen indexlemeye alır.
 * Kurulum: site/public/<key>.txt dosyası key'i barındırıyor (mülkiyet
 * kanıtı); burada aynı key kullanılıyor.
 */
const INDEXNOW_KEY = "bf89cbfcce3949c4708fcd42c7dde58a";
const HOST = "sosyektif.com";

export async function bildirIndexNow(url: string): Promise<void> {
  try {
    const res = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: HOST,
        key: INDEXNOW_KEY,
        keyLocation: `https://${HOST}/${INDEXNOW_KEY}.txt`,
        urlList: [url],
      }),
    });
    if (!res.ok && res.status !== 202) {
      console.warn(`[indexnow] beklenmeyen durum kodu: ${res.status}`);
    }
  } catch (err) {
    // IndexNow bildirimi arızi bir SEO iyileştirmesi; başarısızlığı yayın
    // akışını asla durdurmamalı.
    console.warn("[indexnow] bildirim başarısız (yoksayılıyor):", err instanceof Error ? err.message : err);
  }
}
