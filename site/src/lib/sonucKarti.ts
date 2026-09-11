/**
 * Quiz ve kişilik testi sonuçları için paylaşılabilir kare görsel (1080x1080).
 * Tamamen tarayıcıda canvas ile çizilir — sunucu, kütüphane ya da maliyet yok.
 */
export interface KartIcerigi {
  /** Testin başlığı (en fazla 3 satıra sarılır). */
  ustBaslik: string;
  /** Kartın ortasındaki büyük metin: "8/10" ya da "Satürn". Sığana kadar küçülür. */
  buyukMetin: string;
  altMetin: string;
  cagri: string;
}

function satirlaraBol(ctx: CanvasRenderingContext2D, metin: string, maksGenislik: number): string[] {
  const satirlar: string[] = [];
  let mevcut = '';
  for (const kelime of metin.split(' ')) {
    const aday = mevcut ? `${mevcut} ${kelime}` : kelime;
    if (ctx.measureText(aday).width > maksGenislik && mevcut) {
      satirlar.push(mevcut);
      mevcut = kelime;
    } else {
      mevcut = aday;
    }
  }
  if (mevcut) satirlar.push(mevcut);
  return satirlar;
}

export function sonucKartiCiz(canvas: HTMLCanvasElement, icerik: KartIcerigi): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const G = canvas.width;
  ctx.textAlign = 'center';

  ctx.fillStyle = '#fffaf7';
  ctx.fillRect(0, 0, G, G);

  ctx.fillStyle = '#ff4f64';
  ctx.fillRect(0, 0, G, 160);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 64px system-ui, sans-serif';
  ctx.fillText('sosyektif.com', G / 2, 100);

  ctx.fillStyle = '#201a1c';
  ctx.font = 'bold 44px system-ui, sans-serif';
  satirlaraBol(ctx, icerik.ustBaslik, G - 160)
    .slice(0, 3)
    .forEach((satir, i) => ctx.fillText(satir, G / 2, 300 + i * 56));

  ctx.fillStyle = '#ff4f64';
  let boyut = 220;
  do {
    ctx.font = `bold ${boyut}px system-ui, sans-serif`;
    boyut -= 10;
  } while (boyut >= 60 && ctx.measureText(icerik.buyukMetin).width > G - 120);
  ctx.fillText(icerik.buyukMetin, G / 2, 680);

  ctx.fillStyle = '#201a1c';
  ctx.font = 'bold 56px system-ui, sans-serif';
  ctx.fillText(icerik.altMetin, G / 2, 800);

  ctx.fillStyle = 'rgba(32,26,28,0.6)';
  ctx.font = '38px system-ui, sans-serif';
  ctx.fillText(icerik.cagri, G / 2, 960);
}

/**
 * Mobilde sistemin paylaşım menüsünü (Web Share API) açar; desteklenmiyorsa
 * kartı önizleme olarak gösterip indirir.
 */
export async function kartiPaylas(
  canvas: HTMLCanvasElement,
  secenek: { dosyaAdi: string; baslik: string; metin: string; url: string; onizleme?: HTMLImageElement | null }
): Promise<void> {
  const blob = await new Promise<Blob | null>((coz) => canvas.toBlob(coz, 'image/png'));
  if (!blob) return;
  const dosya = new File([blob], secenek.dosyaAdi, { type: 'image/png' });

  if (navigator.share && navigator.canShare?.({ files: [dosya] })) {
    try {
      await navigator.share({ files: [dosya], title: secenek.baslik, text: secenek.metin, url: secenek.url });
      return;
    } catch (err) {
      // Kullanıcı paylaşım menüsünü kapattıysa indirmeye düşme.
      if (err instanceof DOMException && err.name === 'AbortError') return;
    }
  }

  const dataUrl = canvas.toDataURL('image/png');
  if (secenek.onizleme) {
    secenek.onizleme.src = dataUrl;
    secenek.onizleme.classList.remove('hidden');
  }
  const indir = document.createElement('a');
  indir.href = dataUrl;
  indir.download = secenek.dosyaAdi;
  indir.click();
}
