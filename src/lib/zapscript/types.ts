/**
 * Shapes shared by the ZapScript command catalogue, the step parser and the
 * builder UI. The catalogue is the app's own copy of what Core's ZapScript
 * library understands; `catalog.test.ts` fails when the two drift apart.
 */

/** How one positional argument is entered in the builder. */
export type ZapArgKind =
  /** Free text. */
  | "text"
  /** A media path or title, with the media search as a helper. */
  | "media"
  /** A system ID, chosen with the system picker. */
  | "system"
  /** A whole number. */
  | "number"
  /** A key or button sequence, in the input macro grammar. */
  | "keys"
  /** A URL. */
  | "url"
  /** A file path on the device. */
  | "path"
  /** One of a fixed set of values. */
  | "choice";

export interface ZapArgSpec {
  /** Stable id, unique within the command. */
  id: string;
  /** Translation key of the field label. */
  label: string;
  kind: ZapArgKind;
  required?: boolean;
  /** Allowed values for `choice`. */
  options?: readonly string[];
  /** Untranslated example shown as the placeholder. */
  example?: string;
  /**
   * The argument is the rest of the command's text, commas included, as
   * `input.text` and a launch path are.
   */
  raw?: boolean;
}

/** A named `?name=value` option. */
export interface ZapAdvArgSpec {
  name: string;
  /** Translation key of the field label. */
  label: string;
  /** `launcher` is a launcher ID, chosen from the ones Core reports. */
  kind: "text" | "system" | "launcher" | "number" | "choice";
  options?: readonly string[];
  example?: string;
  /** Only offered while the connected Core runs on this platform. */
  platform?: "mister";
}

export type ZapCommandGroup =
  | "launch"
  | "playlist"
  | "input"
  | "ui"
  | "profile"
  | "mister"
  | "http"
  | "utility";

export interface ZapCommandSpec {
  /** Command name as written after `**`, lower case. */
  name: string;
  group: ZapCommandGroup;
  /** Translation key of the one-line, plain-language description. */
  description: string;
  args: readonly ZapArgSpec[];
  advArgs?: readonly ZapAdvArgSpec[];
  /** Only meaningful on this platform. */
  platform?: "mister";
  /** Name of the command that replaces this deprecated one. */
  replacedBy?: string;
  /**
   * Named by the ZapScript library but not something Core runs as a step of
   * its own, so it is recognised when read and never offered when adding.
   */
  notOffered?: boolean;
}
