export const KATEGORILER = {
  'eglence': { etiket: 'Eğlence', emoji: '🎉' },
  'pop-kultur': { etiket: 'Pop Kültür', emoji: '🎬' },
  'bilim': { etiket: 'Bilim', emoji: '🔬' },
  'teknoloji': { etiket: 'Teknoloji', emoji: '💻' },
  'spor': { etiket: 'Spor', emoji: '⚽' },
  'yasam': { etiket: 'Yaşam', emoji: '🌿' },
  'tarih': { etiket: 'Tarih', emoji: '🏛️' },
} as const;

export type KategoriAnahtari = keyof typeof KATEGORILER;

export const FORMAT_ETIKETLERI = {
  liste: 'Liste',
  trivia: 'Bunu Bilmiyordun',
  quiz: 'Quiz',
  kisilik: 'Kişilik Testi',
} as const;
