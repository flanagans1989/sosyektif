import type { Format } from "./schemas.js";

/** site/src/lib/kategoriler.ts'teki FORMAT_ETIKETLERI ile birebir uyumlu. */
export const FORMAT_ETIKETLERI_TR: Record<Format, string> = {
  liste: "Liste",
  trivia: "Bunu Bilmiyordun",
  quiz: "Quiz",
  kisilik: "Kişilik Testi",
};

/** Sosyal medya paylaşımlarında göze hitap etmesi için (PLAN.md Bölüm 11.2). */
export const FORMAT_EMOJI: Record<Format, string> = {
  liste: "📋",
  trivia: "🤯",
  quiz: "🧠",
  kisilik: "✨",
};

/** site/src/lib/kategoriler.ts'teki KATEGORILER emoji'leriyle birebir uyumlu. */
export const KATEGORI_EMOJI: Record<string, string> = {
  eglence: "🎉",
  "pop-kultur": "🎬",
  bilim: "🔬",
  teknoloji: "💻",
  spor: "⚽",
  yasam: "🌿",
  tarih: "🏛️",
};
