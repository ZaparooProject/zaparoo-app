/**
 * Compiles Go RE2 patterns from go-slugs into JavaScript regexes with the
 * same matching behavior, so the ported patterns can be kept verbatim.
 *
 * Differences handled:
 *   - Go's `\s` is `[\t\n\f\r ]`; JavaScript's also matches \v and Unicode
 *     spaces.
 *   - Go's `.` excludes only \n; JavaScript's also excludes \r, U+2028 and
 *     U+2029.
 *   - Go's `(?i)` uses Unicode simple case folding, so `s` also matches
 *     U+017F (long s) and `k` also matches U+212A (Kelvin sign). JavaScript's
 *     `i` flag without `u` folds ASCII letters only, so those two are added
 *     explicitly.
 *
 * The `u` flag is deliberately not used: with `iu` JavaScript's `\b` treats
 * U+017F and U+212A as word characters, which Go does not, and regexes built
 * at runtime cannot be transpiled for the legacy browser build. Patterns that
 * need Unicode property escapes are written as regex literals instead.
 */

const goSpaceClass = "\\t\\n\\f\\r ";

/** Builds a JavaScript regex from a Go RE2 pattern. */
export function goRegExp(pattern: string, global = false): RegExp {
  let src = pattern;
  let fold = false;
  const flagAt = src.indexOf("(?i)");
  if (flagAt >= 0) {
    // A mid-pattern (?i) only works here when nothing before it has case.
    if (/[A-Za-z]/.test(src.slice(0, flagAt).replace(/\\./g, ""))) {
      throw new Error(`unsupported (?i) position in ${pattern}`);
    }
    src = src.slice(0, flagAt) + src.slice(flagAt + 4);
    fold = true;
  }

  let out = "";
  let inClass = false;
  let classBody = "";
  for (let i = 0; i < src.length; i++) {
    const c = src.charAt(i);
    if (c === "\\") {
      const next = src.charAt(i + 1);
      i++;
      if (next === "s") {
        if (inClass) classBody += goSpaceClass;
        else out += `[${goSpaceClass}]`;
      } else if (next === "p" || next === "P" || next === "x") {
        throw new Error(`unsupported escape \\${next} in ${pattern}`);
      } else if (inClass) {
        classBody += `\\${next}`;
      } else {
        out += `\\${next}`;
      }
      continue;
    }
    if (inClass) {
      // A "]" right after "[" or "[^" is a literal in RE2.
      if (c === "]" && classBody !== "" && classBody !== "^") {
        out += `[${classBody}${fold ? foldedClassExtras(classBody) : ""}]`;
        inClass = false;
        classBody = "";
      } else {
        classBody += c;
      }
      continue;
    }
    if (c === "[") {
      inClass = true;
    } else if (c === ".") {
      out += "[^\\n]";
    } else if (fold && (c === "s" || c === "S")) {
      out += "[sSſ]";
    } else if (fold && (c === "k" || c === "K")) {
      out += "[kKK]";
    } else {
      out += c;
    }
  }
  if (inClass) throw new Error(`unterminated class in ${pattern}`);

  return new RegExp(out, (fold ? "i" : "") + (global ? "g" : ""));
}

// Adding the characters works for negated classes too: Go negates the folded
// class, so those characters must be excluded there as well.
function foldedClassExtras(body: string): string {
  const positive = new RegExp(`[${body.replace(/^\^/, "")}]`, "i");
  return (positive.test("s") ? "ſ" : "") + (positive.test("k") ? "K" : "");
}

/** Go's FindAllStringIndex(s, -1) for a non-empty-matching regex. */
export function findAllIndex(re: RegExp, s: string): [number, number][] {
  const global = new RegExp(
    re.source,
    re.flags.includes("g") ? re.flags : `${re.flags}g`,
  );
  const out: [number, number][] = [];
  let m: RegExpExecArray | null;
  while ((m = global.exec(s)) !== null) {
    out.push([m.index, m.index + m[0].length]);
  }
  return out;
}
