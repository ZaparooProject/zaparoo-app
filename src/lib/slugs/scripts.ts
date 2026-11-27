/**
 * Writing-system detection. Ported from go-slugs scripts.go.
 */

/**
 * ScriptType represents different writing systems supported by the slug
 * system. Each script type may require different normalization strategies.
 */
export const ScriptLatin = 0; // Latin alphabet (English, French, Spanish, etc.)
export const ScriptCJK = 1; // Chinese, Japanese, Korean
export const ScriptCyrillic = 2; // Russian, Ukrainian, Bulgarian, Serbian, etc.
export const ScriptGreek = 3; // Greek
export const ScriptIndic = 4; // Devanagari, Bengali, Tamil, Telugu, etc.
export const ScriptArabic = 5; // Arabic, Urdu, Persian/Farsi
export const ScriptHebrew = 6; // Hebrew
export const ScriptThai = 7; // Thai (requires n-gram matching)
export const ScriptBurmese = 8; // Burmese/Myanmar (requires n-gram matching)
export const ScriptKhmer = 9; // Khmer/Cambodian (requires n-gram matching)
export const ScriptLao = 10; // Lao (requires n-gram matching)
export const ScriptAmharic = 11; // Amharic/Ethiopic

export type ScriptType =
  | typeof ScriptLatin
  | typeof ScriptCJK
  | typeof ScriptCyrillic
  | typeof ScriptGreek
  | typeof ScriptIndic
  | typeof ScriptArabic
  | typeof ScriptHebrew
  | typeof ScriptThai
  | typeof ScriptBurmese
  | typeof ScriptKhmer
  | typeof ScriptLao
  | typeof ScriptAmharic;

/**
 * detectScript identifies the primary writing system used in a string.
 * Returns the first matching script type, or ScriptLatin as the default.
 */
export function detectScript(s: string): ScriptType {
  // Every range checked is below the surrogate block, so scanning UTF-16 code
  // units gives the same result as Go's rune loop.
  let hasNonASCII = false;
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 127) {
      hasNonASCII = true;
      break;
    }
  }
  if (!hasNonASCII) {
    return ScriptLatin;
  }

  // Ordered by global prevalence for early exit
  for (let i = 0; i < s.length; i++) {
    const r = s.charCodeAt(i);
    if (
      (r >= 0x4e00 && r <= 0x9fff) || // CJK Unified Ideographs
      (r >= 0x3400 && r <= 0x4dbf) || // CJK Extension A
      (r >= 0x3040 && r <= 0x309f) || // Hiragana
      (r >= 0x30a0 && r <= 0x30ff) || // Katakana
      (r >= 0xac00 && r <= 0xd7a3) || // Hangul
      r === 0x30fc ||
      r === 0x30fb ||
      r === 0x3005
    ) {
      return ScriptCJK;
    }

    if (r >= 0x0400 && r <= 0x04ff) {
      return ScriptCyrillic;
    }

    if (
      (r >= 0x0900 && r <= 0x097f) || // Devanagari
      (r >= 0x0980 && r <= 0x09ff) || // Bengali
      (r >= 0x0b80 && r <= 0x0bff) || // Tamil
      (r >= 0x0c00 && r <= 0x0c7f) || // Telugu
      (r >= 0x0c80 && r <= 0x0cff) || // Kannada
      (r >= 0x0d00 && r <= 0x0d7f) || // Malayalam
      (r >= 0x0a00 && r <= 0x0a7f) || // Gurmukhi
      (r >= 0x0a80 && r <= 0x0aff) || // Gujarati
      (r >= 0x0b00 && r <= 0x0b7f) || // Oriya
      (r >= 0x0d80 && r <= 0x0dff) // Sinhala
    ) {
      return ScriptIndic;
    }

    if (r >= 0x0600 && r <= 0x06ff) {
      return ScriptArabic;
    }

    if (r >= 0x0e00 && r <= 0x0e7f) {
      return ScriptThai;
    }

    if (r >= 0x0370 && r <= 0x03ff) {
      return ScriptGreek;
    }

    if (r >= 0x0590 && r <= 0x05ff) {
      return ScriptHebrew;
    }

    if (r >= 0x1000 && r <= 0x109f) {
      return ScriptBurmese;
    }

    if (r >= 0x1780 && r <= 0x17ff) {
      return ScriptKhmer;
    }

    if (r >= 0x0e80 && r <= 0x0eff) {
      return ScriptLao;
    }

    if (r >= 0x1200 && r <= 0x137f) {
      return ScriptAmharic;
    }
  }

  return ScriptLatin;
}

/**
 * needsUnicodeSlug returns true if the script requires preserving Unicode
 * characters in the final slug (as opposed to ASCII-only slugs for pure Latin
 * text).
 */
export function needsUnicodeSlug(script: ScriptType): boolean {
  return script !== ScriptLatin;
}
