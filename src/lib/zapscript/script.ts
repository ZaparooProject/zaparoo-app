/**
 * Reads ZapScript text into steps for the builder and writes steps back.
 *
 * The grammar follows Core's parser (go-zapscript `parser.go`,
 * `arguments.go`). Two rules keep the builder from ever damaging a script:
 * a step keeps its original text and is emitted verbatim until it is edited,
 * and anything the builder has no form for (JSON arguments, the
 * `@System/Title` shorthand) becomes a raw step that is edited as text.
 * An expression, `[[ ... ]]`, is kept in a value exactly as written, so it
 * can be typed into any field.
 * Scripts whose command boundaries cannot be found reliably are not split at
 * all; the caller falls back to plain text editing.
 */

export interface ZapStep {
  /** Stable key for the UI. */
  id: string;
  /** Lower-case command name; empty for a raw step. */
  name: string;
  /**
   * Decoded positional arguments, with any `[[expression]]` as written. Input
   * commands hold their text verbatim.
   */
  args: string[];
  advArgs: [name: string, value: string][];
  /** Text this step was read from; dropped as soon as the step is edited. */
  source?: string;
  /** Shown and edited as text: `args[0]` is the whole command. */
  raw?: boolean;
  /** A launch written without `**launch:`, as plain media text. */
  bare?: boolean;
}

export type ZapParseResult =
  | { ok: true; steps: ZapStep[] }
  | { ok: false; steps: [] };

const INPUT_MACRO_COMMANDS = new Set(["input.keyboard", "input.gamepad"]);
const INPUT_RAW_COMMAND = "input.text";
const ESCAPES: Record<string, string> = { n: "\n", r: "\r", t: "\t" };

let nextStepId = 0;
const stepId = () => `step-${++nextStepId}`;

/** A new, empty step for a command. */
export function createZapStep(name: string, args: string[] = []): ZapStep {
  return { id: stepId(), name, args, advArgs: [] };
}

const isAdvNameChar = (ch: string) => /^[A-Za-z0-9_]$/.test(ch);
const isWhitespace = (ch: string) =>
  ch === " " || ch === "\t" || ch === "\n" || ch === "\r";

/** Thrown when command boundaries cannot be trusted. */
class Unsplittable extends Error {}

class Scanner {
  pos = 0;
  /** Set while reading a step the builder has no form for. */
  complex = false;
  constructor(readonly text: string) {}

  get done() {
    return this.pos >= this.text.length;
  }
  peek(offset = 0) {
    return this.text[this.pos + offset] ?? "";
  }
  /** At `||`, the end of a command. A single `|` is ordinary text. */
  atCommandEnd() {
    return this.peek() === "|" && this.peek(1) === "|";
  }

  escape(): string {
    // The caller has consumed `^`.
    if (this.done) return "^";
    const ch = this.text[this.pos++]!;
    // An escaped `[` beside another would read as an expression once decoded,
    // and a field has no way to tell the two apart.
    if (
      ch === "[" &&
      (this.peek() === "[" ||
        (this.peek() === "^" && this.peek(1) === "[") ||
        this.text[this.pos - 3] === "[")
    ) {
      this.complex = true;
    }
    return ESCAPES[ch] ?? ch;
  }

  /** `[[ ... ]]`, returned as written; a lone `[` is ordinary text. */
  expression(): string {
    // The caller has consumed the first `[`.
    if (this.peek() !== "[") return "[";
    const end = this.text.indexOf("]]", this.pos + 1);
    if (end === -1) throw new Unsplittable();
    const raw = `[${this.text.slice(this.pos, end + 2)}`;
    this.pos = end + 2;
    return raw;
  }

  quoted(quote: string): string {
    let value = "";
    for (;;) {
      if (this.done) throw new Unsplittable();
      const ch = this.text[this.pos++]!;
      if (ch === "^") value += this.escape();
      else if (ch === "[") value += this.expression();
      else if (ch === quote) return value;
      else value += ch;
    }
  }

  /** A JSON object argument, kept as text. */
  json(): string {
    // The caller has consumed `{`.
    const start = this.pos - 1;
    let depth = 1;
    let inString = false;
    while (depth > 0) {
      if (this.done) throw new Unsplittable();
      const ch = this.text[this.pos++]!;
      if (inString) {
        if (ch === "\\") this.pos++;
        else if (ch === '"') inString = false;
      } else if (ch === '"') inString = true;
      else if (ch === "{") depth++;
      else if (ch === "}") depth--;
    }
    this.complex = true;
    return this.text.slice(start, this.pos);
  }

  /**
   * `name=value&name=value` up to the end of the command. When a name is not
   * a valid advanced-argument name, `fallback` holds the text read so far,
   * which Core then treats as ordinary content.
   */
  advArgs(): { args: [string, string][]; fallback?: string } {
    // The caller has consumed `?`.
    const start = this.pos;
    const args: [string, string][] = [];
    let name = "";
    let value = "";
    let inValue = false;
    let valueStart = -1;
    const store = () => {
      if (name) {
        const existing = args.find(([key]) => key === name);
        if (existing) existing[1] = value.trim();
        else args.push([name, value.trim()]);
      }
      name = "";
      value = "";
    };
    for (;;) {
      if (this.done) break;
      if (this.atCommandEnd()) break;
      const at = this.pos;
      const ch = this.text[this.pos++]!;
      if (inValue) {
        if (at === valueStart && (ch === '"' || ch === "'")) {
          value = this.quoted(ch);
          continue;
        }
        if (at === valueStart && ch === "{") {
          value = this.json();
          continue;
        }
        if (ch === "^") {
          value += this.escape();
          continue;
        }
      }
      if (ch === "&") {
        store();
        inValue = false;
      } else if (ch === "=" && !inValue) {
        inValue = true;
        valueStart = this.pos;
      } else if (inValue) {
        value += ch === "[" ? this.expression() : ch;
      } else if (!isAdvNameChar(ch)) {
        return { args: [], fallback: this.text.slice(start, this.pos) };
      } else {
        name += ch;
      }
    }
    store();
    return { args };
  }

  /** Positional arguments in the default grammar, then advanced arguments. */
  args(prefix: string, single: boolean) {
    const args: string[] = [];
    let advArgs: [string, string][] = [];
    let current = prefix;
    let written = prefix !== "";
    let argStart = this.pos;
    for (;;) {
      if (this.done || this.atCommandEnd()) break;
      const at = this.pos;
      const ch = this.text[this.pos++]!;
      if (at === argStart && (ch === '"' || ch === "'")) {
        current = this.quoted(ch);
        written = true;
      } else if (at === argStart && ch === "{") {
        current = this.json();
        written = true;
      } else if (ch === "^") {
        current += this.escape();
        written = true;
      } else if (!single && ch === ",") {
        args.push(current.trim());
        current = "";
        written = false;
        argStart = this.pos;
      } else if (ch === "?") {
        const parsed = this.advArgs();
        if (parsed.fallback !== undefined) {
          current += `?${parsed.fallback}`;
          continue;
        }
        advArgs = parsed.args;
        break;
      } else if (ch === "[") {
        current += this.expression();
        written = true;
      } else {
        current += ch;
        if (!isWhitespace(ch)) written = true;
      }
    }
    const last = current.trim();
    if (last !== "" || written) args.push(last);
    return { args, advArgs };
  }

  /** Key or button text, kept exactly as written. */
  inputMacro() {
    const start = this.pos;
    let advArgs: [string, string][] = [];
    let end = -1;
    for (;;) {
      if (this.done || this.atCommandEnd()) break;
      const at = this.pos;
      const ch = this.text[this.pos++]!;
      if (ch === "\\") {
        this.pos++;
      } else if (ch === "{") {
        const close = this.text.indexOf("}", this.pos);
        if (close === -1) throw new Unsplittable();
        this.pos = close + 1;
      } else if (ch === "[") {
        this.expression();
      } else if (ch === "?") {
        const parsed = this.advArgs();
        if (parsed.fallback !== undefined) continue;
        advArgs = parsed.args;
        end = at;
        break;
      }
    }
    const text = this.text.slice(start, end === -1 ? this.pos : end);
    return { args: text === "" ? [] : [text], advArgs };
  }

  /** Literal text to type: no escapes, no advanced arguments. */
  inputRaw() {
    const start = this.pos;
    while (!this.done && !this.atCommandEnd()) this.pos++;
    const text = this.text.slice(start, this.pos);
    return { args: text === "" ? [] : [text], advArgs: [] };
  }
}

/** Splits ZapScript into steps, or reports that it must be edited as text. */
export function parseZapScript(text: string): ZapParseResult {
  const scanner = new Scanner(text);
  const steps: ZapStep[] = [];
  try {
    for (;;) {
      while (!scanner.done && isWhitespace(scanner.peek())) scanner.pos++;
      if (scanner.done) break;
      const start = scanner.pos;
      scanner.complex = false;
      const ch = scanner.peek();
      // A leading `{` is reserved by Core, and trait shorthand does not end at
      // a command separator, so neither can be split into steps.
      if (ch === "#" || (start === 0 && ch === "{")) throw new Unsplittable();

      let step: ZapStep;
      const name = /^\*\*([A-Za-z0-9.]+)/.exec(text.slice(start))?.[1];
      const afterName = name ? text[start + 2 + name.length] : undefined;
      const ends =
        afterName === undefined ||
        (afterName === "|" && text[start + 3 + name!.length] === "|");
      if (name && (ends || afterName === ":" || afterName === "?")) {
        const command = name.toLowerCase();
        scanner.pos = start + 2 + name.length;
        let parsed: { args: string[]; advArgs: [string, string][] } = {
          args: [],
          advArgs: [],
        };
        if (!ends) {
          // `?` straight after the name starts advanced arguments.
          if (afterName === ":") scanner.pos++;
          parsed = INPUT_MACRO_COMMANDS.has(command)
            ? scanner.inputMacro()
            : command === INPUT_RAW_COMMAND
              ? scanner.inputRaw()
              : scanner.args("", false);
        }
        step = { id: stepId(), name: command, ...parsed };
      } else if (ch === "@") {
        // Media title shorthand: read as one argument, shown as text.
        scanner.args("", true);
        scanner.complex = true;
        step = { id: stepId(), name: "", args: [], advArgs: [] };
      } else {
        // Anything else is media to launch.
        const parsed = scanner.args("", true);
        step = { id: stepId(), name: "launch", bare: true, ...parsed };
      }

      const source = text.slice(start, scanner.pos);
      if (scanner.atCommandEnd()) scanner.pos += 2;
      // Nothing between two separators: no step to show, nothing to write.
      if (source === "") continue;
      if (scanner.complex) {
        step = {
          id: step.id,
          name: "",
          args: [source],
          advArgs: [],
          raw: true,
        };
      }
      step.source = source;
      steps.push(step);
    }
  } catch (error) {
    if (error instanceof Unsplittable) return { ok: false, steps: [] };
    throw error;
  }
  return { ok: true, steps };
}

/** A value's text, split into its expressions and the text around them. */
function splitExpressions(value: string) {
  const parts: { text: string; expression: boolean }[] = [];
  let at = 0;
  for (;;) {
    const start = value.indexOf("[[", at);
    const end = start === -1 ? -1 : value.indexOf("]]", start + 2);
    if (end === -1) break;
    parts.push({ text: value.slice(at, start), expression: false });
    parts.push({ text: value.slice(start, end + 2), expression: true });
    at = end + 2;
  }
  parts.push({ text: value.slice(at), expression: false });
  return parts;
}

/**
 * Core's `escapeArg`: a double-quoted argument with `^` escapes. Expressions
 * are written as they are, and `[` is only escaped where it would otherwise
 * open one that never closes.
 */
function quote(value: string): string {
  let out = '"';
  for (const part of splitExpressions(value)) {
    if (part.expression) {
      out += part.text;
      continue;
    }
    for (let i = 0; i < part.text.length; i++) {
      const ch = part.text[i]!;
      if (ch === '"') out += '^"';
      else if (ch === "\n") out += "^n";
      else if (ch === "\r") out += "^r";
      else if (ch === "\t") out += "^t";
      else if (ch === "^") out += "^^";
      else if (ch === "[" && part.text[i + 1] === "[") out += "^[";
      else out += ch;
    }
  }
  return `${out}"`;
}

/** Whether a value would be read back differently if written unquoted. */
function needsQuoting(value: string, separators: string): boolean {
  if (value === "" || value !== value.trim()) return true;
  if (/^["'{]/.test(value) || value.endsWith("|")) return true;
  // Core reads an expression whole, so only the text around it matters.
  return splitExpressions(value).some(({ text, expression }) => {
    if (expression) return false;
    if (/[\^\n\r\t]/.test(text) || text.includes("[[")) return true;
    if (text.includes("||")) return true;
    for (const ch of separators) if (text.includes(ch)) return true;
    return false;
  });
}

function serializeAdvArgs(advArgs: ZapStep["advArgs"]): string {
  const written = advArgs.filter(([name, value]) => name && value !== "");
  if (written.length === 0) return "";
  return `?${written
    .map(
      ([name, value]) =>
        `${name}=${needsQuoting(value, "&") ? quote(value) : value}`,
    )
    .join("&")}`;
}

/**
 * A value as it must be written to sit in a command's argument list: quoted
 * when a comma, `?`, a leading quote or `||` would otherwise end or change it.
 */
export function quoteZapArgument(value: string): string {
  return needsQuoting(value, ",?") ? quote(value) : value;
}

/** The ZapScript for one step, ignoring any text it was read from. */
export function writeZapStep(step: ZapStep): string {
  if (step.raw) return step.args[0] ?? "";
  const advArgs = serializeAdvArgs(step.advArgs);
  if (INPUT_MACRO_COMMANDS.has(step.name)) {
    const text = step.args[0] ?? "";
    return `**${step.name}${text ? `:${text}` : ""}${advArgs}`;
  }
  if (step.name === INPUT_RAW_COMMAND) {
    const text = step.args[0] ?? "";
    return `**${step.name}${text ? `:${text}` : ""}`;
  }
  if (step.bare) {
    const media = step.args[0] ?? "";
    // Plain media text only works when it cannot be read as something else.
    if (media !== "" && !/^[*@#{]/.test(media) && !needsQuoting(media, "?")) {
      return `${media}${advArgs}`;
    }
  }
  const args = [...step.args];
  while (args.length > 0 && args.at(-1) === "") args.pop();
  const written = args.map((arg) =>
    needsQuoting(arg, ",?") ? quote(arg) : arg,
  );
  return `**${step.name}${written.length ? `:${written.join(",")}` : ""}${advArgs}`;
}

/** The ZapScript for one step: its original text until it has been edited. */
export function serializeZapStep(step: ZapStep): string {
  return step.source ?? writeZapStep(step);
}

export function serializeZapScript(steps: readonly ZapStep[]): string {
  return steps
    .map(serializeZapStep)
    .filter((text) => text !== "")
    .join("||");
}
