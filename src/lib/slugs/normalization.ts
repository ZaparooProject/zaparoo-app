/**
 * Script-specific Unicode normalization. Ported from go-slugs
 * normalization.go.
 */
import {
  ScriptAmharic,
  ScriptArabic,
  ScriptBurmese,
  ScriptCJK,
  ScriptCyrillic,
  ScriptGreek,
  ScriptHebrew,
  ScriptIndic,
  ScriptKhmer,
  ScriptLao,
  ScriptLatin,
  ScriptThai,
  type ScriptType,
} from "./scripts";

const nonspacingMarks = /\p{Mn}/gu;

/**
 * removeDiacritics strips diacritical marks from text.
 * Used for Latin, Cyrillic, and Greek scripts where diacritics can be safely
 * removed for matching.
 */
export function removeDiacritics(s: string): string {
  return s.normalize("NFD").replace(nonspacingMarks, "").normalize("NFC");
}

/**
 * removeArabicVowelMarks strips Arabic diacritical marks (Tashkeel/Harakat).
 * These are optional vowel marks that users typically don't type when
 * searching.
 */
export function removeArabicVowelMarks(s: string): string {
  return s.replace(/[ً-ٟ]/g, "");
}

/**
 * removeHebrewVowelMarks strips Hebrew diacritical marks (Niqqud).
 * These are optional vowel points that users typically don't type when
 * searching.
 */
export function removeHebrewVowelMarks(s: string): string {
  return s.replace(/[֑-ׇ]/g, "");
}

/**
 * normalizeGreekPunctuation converts Greek-specific punctuation to standard
 * forms. Also normalizes final sigma (ς) to regular sigma (σ) for consistent
 * matching.
 */
export function normalizeGreekPunctuation(s: string): string {
  s = s.split(";").join("?"); // Greek question mark (looks like semicolon)
  s = s.split("ς").join("σ");
  return s;
}

/** normalizeArabicPunctuation converts Arabic-specific punctuation. */
export function normalizeArabicPunctuation(s: string): string {
  s = s.split("،").join(","); // Arabic comma
  s = s.split("؛").join(";"); // Arabic semicolon
  s = s.split("؟").join("?"); // Arabic question mark
  return s;
}

/** normalizeAmharicPunctuation converts Ethiopic-specific punctuation. */
export function normalizeAmharicPunctuation(s: string): string {
  s = s.split("።").join("."); // Ethiopic full stop
  s = s.split("፤").join(";"); // Ethiopic semicolon
  s = s.split("፣").join(","); // Ethiopic comma
  s = s.split("፡").join(" "); // Ethiopic word space
  return s;
}

/**
 * removeThaiToneMarks strips Thai tone marks and vowel signs that can vary.
 * These are combining characters that can make matching more flexible.
 */
export function removeThaiToneMarks(s: string): string {
  return s.replace(/[ิ-ฺ็-๎]/g, "");
}

/**
 * normalizeTurkishCharacters handles Turkish-specific character
 * transliterations. Turkish dotless i (ı) and dotted İ are separate letters,
 * not diacritic variants, so ASCII matching needs explicit handling.
 */
export function normalizeTurkishCharacters(s: string): string {
  s = s.split("ı").join("i");
  s = s.split("İ").join("I");
  return s;
}

/**
 * transliterateSpecialLatin converts Latin characters that don't decompose
 * via NFKD. These are distinct letters in their respective alphabets that
 * need explicit mapping for consistent ASCII slug generation.
 */
export function transliterateSpecialLatin(s: string): string {
  const pairs: [string, string][] = [
    // Polish
    ["Ł", "L"],
    ["ł", "l"],
    // Scandinavian/Danish/Norwegian
    ["Ø", "O"],
    ["ø", "o"],
    ["Å", "A"],
    ["å", "a"],
    // German
    ["ß", "ss"],
    ["ẞ", "SS"],
    // Ligatures
    ["Æ", "AE"],
    ["æ", "ae"],
    ["Œ", "OE"],
    ["œ", "oe"],
    // Icelandic
    ["Þ", "TH"],
    ["þ", "th"],
    ["Ð", "D"],
    ["ð", "d"],
    // Croatian/Serbian/Vietnamese
    ["Đ", "D"],
    ["đ", "d"],
  ];
  for (const [from, to] of pairs) {
    s = s.split(from).join(to);
  }
  return s;
}

/**
 * normalizeLatinExtended handles special cases for Latin-based scripts with
 * unique requirements: Vietnamese tone diacritics, Turkish dotted/dotless I,
 * and Latin letters that don't decompose via NFKD (Ł, Ø, ß, Æ, Œ, Þ, Đ).
 */
export function normalizeLatinExtended(
  s: string,
  preserveVietnamese: boolean,
): string {
  // Transliterate before diacritic removal: these don't decompose via NFKD
  s = transliterateSpecialLatin(s);

  if (!preserveVietnamese) {
    s = removeDiacritics(s);
  }

  s = normalizeTurkishCharacters(s);

  return s;
}

/** normalizeByScript applies script-specific normalization rules. */
export function normalizeByScript(s: string, script: ScriptType): string {
  switch (script) {
    case ScriptLatin:
      s = s.normalize("NFKC");
      s = normalizeLatinExtended(s, false);
      break;

    case ScriptCJK:
      // NFC only: NFKC mangles katakana
      s = s.normalize("NFC");
      break;

    case ScriptCyrillic:
      // NFKC + diacritic removal (ё→е)
      s = s.normalize("NFKC");
      s = removeDiacritics(s);
      break;

    case ScriptGreek:
      s = s.normalize("NFKC");
      s = removeDiacritics(s);
      s = normalizeGreekPunctuation(s);
      break;

    case ScriptIndic:
      // NFKC but PRESERVE vowel marks: matras are fundamental to the script
      s = s.normalize("NFKC");
      break;

    case ScriptArabic:
      s = s.normalize("NFKC");
      s = removeArabicVowelMarks(s);
      s = normalizeArabicPunctuation(s);
      break;

    case ScriptHebrew:
      s = s.normalize("NFKC");
      s = removeHebrewVowelMarks(s);
      break;

    case ScriptThai:
    case ScriptBurmese:
    case ScriptKhmer:
    case ScriptLao:
      s = s.normalize("NFKC");
      if (script === ScriptThai) {
        s = removeThaiToneMarks(s);
      }
      break;

    case ScriptAmharic:
      s = s.normalize("NFKC");
      s = normalizeAmharicPunctuation(s);
      break;

    default:
      s = s.normalize("NFKC");
  }

  return s;
}
