// Utility functions for QuranBot

export function removeArabicDiacritics(text) {
  const diacritics = /[\u064B-\u0652\u06E1\u0670]/g;
  const hamza = /[أ,آ,ٱ,إ]/g;
  let newtext = text.replace(diacritics, "");
  newtext = newtext.replace(hamza, "ا");
  return newtext;
}
