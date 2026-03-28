const ENGLISH_COPY = {
  triggerLabel: 'Rate this chat',
  positiveAriaLabel: 'Helpful',
  negativeAriaLabel: 'Not helpful',
  commentPlaceholder: 'Add a short note if you want...',
  submitLabel: 'Send Feedback',
  thankYouLabel: 'Thank you for your feedback!',
  typingLabel: 'Typing...',
  genericError: 'Sorry, something went wrong.',
  connectionError: 'Connection error. Please try again.',
  reasons: [
    { code: 'WRONG_ANSWER', label: 'It gave incorrect information' },
    { code: 'MISUNDERSTOOD', label: "It didn't understand me" },
    { code: 'NOT_RESOLVED', label: "It didn't solve my issue" },
    { code: 'NOT_SPECIFIC', label: "It didn't answer clearly" },
    { code: 'BLOCKED_PROGRESS', label: 'It stopped the flow unnecessarily' },
    { code: 'OTHER', label: 'Other' }
  ]
};

const TURKISH_COPY = {
  triggerLabel: 'Sohbeti değerlendir',
  positiveAriaLabel: 'Yardımcı oldu',
  negativeAriaLabel: 'Yardımcı olmadı',
  commentPlaceholder: 'İstersen kısa bir not ekle...',
  submitLabel: 'Geri Bildirim Gönder',
  thankYouLabel: 'Geri bildirimin için teşekkürler.',
  typingLabel: 'Yazıyor...',
  genericError: 'Üzgünüz, bir hata oluştu.',
  connectionError: 'Bağlantı hatası. Lütfen tekrar deneyin.',
  reasons: [
    { code: 'WRONG_ANSWER', label: 'Yanlış bilgi verdi' },
    { code: 'MISUNDERSTOOD', label: 'Ne demek istediğimi anlamadı' },
    { code: 'NOT_RESOLVED', label: 'Sorunumu çözmedi' },
    { code: 'NOT_SPECIFIC', label: 'Soruma net cevap vermedi' },
    { code: 'BLOCKED_PROGRESS', label: 'Gereksiz yere durdurdu' },
    { code: 'OTHER', label: 'Diğer' }
  ]
};

const FEEDBACK_COPY_BY_LOCALE = Object.freeze({
  tr: TURKISH_COPY,
  en: ENGLISH_COPY,
  de: ENGLISH_COPY,
  es: ENGLISH_COPY,
  fr: ENGLISH_COPY,
  it: ENGLISH_COPY,
  nl: ENGLISH_COPY,
  ar: ENGLISH_COPY,
  hi: ENGLISH_COPY,
  ja: ENGLISH_COPY,
  ko: ENGLISH_COPY,
  pl: ENGLISH_COPY,
  ru: ENGLISH_COPY,
  sv: ENGLISH_COPY,
  zh: ENGLISH_COPY
});

export function getChatWidgetFeedbackCopy(locale = 'tr') {
  const normalized = String(locale || 'tr').toLowerCase().split('-')[0];
  return FEEDBACK_COPY_BY_LOCALE[normalized] || ENGLISH_COPY;
}

export default getChatWidgetFeedbackCopy;
