function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wordWrap(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const aday = current ? `${current} ${word}` : word;
    if (aday.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = aday;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 4); // 4 satırdan fazlası taşar, kırpılır
}

/**
 * Kişi/gerçek olay ilişkili konularda ya da stok görsel bulunamadığında
 * kullanılan, lisans riski taşımayan tipografik kapak (PLAN.md R10).
 * og-default.svg ile aynı marka diliyle üretilir.
 */
export function generateTypographicCoverSvg(baslik: string): string {
  const satirlar = wordWrap(baslik, 22);
  const baslangicY = 315 - (satirlar.length - 1) * 40;

  const tspanlar = satirlar
    .map((satir, i) => `<tspan x="600" y="${baslangicY + i * 80}">${escapeXml(satir)}</tspan>`)
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#FFFAF7"/>
  <rect width="1200" height="630" fill="url(#g)" opacity="0.15"/>
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FF4F64"/>
      <stop offset="1" stop-color="#FFFAF7"/>
    </linearGradient>
  </defs>
  <text font-family="Arial, sans-serif" font-size="56" font-weight="800" fill="#201A1C" text-anchor="middle">${tspanlar}</text>
  <text x="600" y="590" font-family="Arial, sans-serif" font-size="24" fill="#FF4F64" text-anchor="middle" font-weight="700">sosyektif</text>
</svg>`;
}
