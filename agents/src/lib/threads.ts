/**
 * Threads paylaşımı (PLAN.md Bölüm 11.2). Threads'in asıl gücü tıklanabilir
 * link — bu yüzden görsel/carousel yerine kısa metin + doğrudan link
 * paylaşılır (bkz. plan tablosu: "Trafik yolu: Doğrudan link").
 * Token yoksa/süresi dolmuşsa sessizce atlanır (R5 deseni).
 */
import { getMetaToken } from "./metaToken.js";

const GRAPH_BASE = "https://graph.threads.net/v1.0";

function bekle(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Threads medya container'ı arka planda işleniyor; FINISHED olmadan
 * yayınlamaya çalışmak "Medya bulunamıyor" hatası veriyor. */
async function containerHazirOlanaKadarBekle(containerId: string, accessToken: string): Promise<void> {
  for (let deneme = 0; deneme < 10; deneme++) {
    await bekle(3000);
    const res = await fetch(
      `${GRAPH_BASE}/${containerId}?` +
        new URLSearchParams({ fields: "status", access_token: accessToken })
    );
    if (!res.ok) continue; // geçici hata — bir sonraki denemede tekrar dene
    const { status } = (await res.json()) as { status?: string };
    if (status === "FINISHED") return;
    if (status === "ERROR") throw new Error("[threads] container işlenirken hata oluştu");
  }
  // Zaman aşımı — yine de yayınlamayı dene, çoğu zaman bu noktada hazırdır.
}

/** @returns Yayınlanan gönderinin ID'si (sosyal performans ajanı için,
 *   bkz. agents/src/orchestrator/sosyalPerformans.ts) — token yoksa `null`. */
export async function postToThreads(text: string, url: string): Promise<string | null> {
  const token = await getMetaToken("threads");
  if (!token) {
    console.warn("[threads] token yok, paylaşım atlandı");
    return null;
  }

  const metin = `${text}\n\n${url}`.slice(0, 500); // Threads gönderi sınırı

  // 1) Medya container'ı oluştur (TEXT_POST, link Threads'te otomatik önizleme kartına dönüşür).
  // Not: bu iki uç nokta POST olmalı — GET ile çağrıldığında Graph API
  // "threads_publish"i "me" üzerinde var olmayan bir alan sanıp hata veriyor
  // (2026-09-12'de gerçek token ile doğrulandı).
  const olusturRes = await fetch(
    `${GRAPH_BASE}/me/threads?` +
      new URLSearchParams({
        media_type: "TEXT",
        text: metin,
        access_token: token.access_token,
      }),
    { method: "POST" }
  );
  if (!olusturRes.ok) {
    throw new Error(`[threads] container oluşturulamadı: ${olusturRes.status} ${await olusturRes.text()}`);
  }
  const { id: containerId } = (await olusturRes.json()) as { id: string };

  // 1.5) Container arka planda işleniyor — hemen yayınlamak "Medya bulunamıyor"
  // hatası veriyor (2026-09-12'de gerçek token ile doğrulandı). Meta'nın
  // önerdiği gibi status_code FINISHED olana kadar bekle (maks. ~30sn).
  await containerHazirOlanaKadarBekle(containerId, token.access_token);

  // 2) Yayınla.
  const yayinRes = await fetch(
    `${GRAPH_BASE}/me/threads_publish?` +
      new URLSearchParams({ creation_id: containerId, access_token: token.access_token }),
    { method: "POST" }
  );
  if (!yayinRes.ok) {
    throw new Error(`[threads] yayınlanamadı: ${yayinRes.status} ${await yayinRes.text()}`);
  }
  const { id } = (await yayinRes.json()) as { id: string };
  return id;
}
