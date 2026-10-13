/** Built-in widgets on the Zap page that the user can move, hide and show. */
export const ZAP_BUILTIN_WIDGET_IDS = [
  "nowPlaying",
  "scan",
  "controls",
  "readers",
  "favourites",
  "recents",
] as const;
export type ZapBuiltinWidgetId = (typeof ZAP_BUILTIN_WIDGET_IDS)[number];

/** A custom button's widget id: the prefix, then the button's own id. */
export type ZapButtonWidgetId = `button:${string}`;
/** A custom collection row's widget id: the prefix, then the row's own id. */
export type ZapCollectionWidgetId = `collection:${string}`;
export type ZapWidgetId =
  | ZapBuiltinWidgetId
  | ZapButtonWidgetId
  | ZapCollectionWidgetId;

/** Where a widget sits. `hidden` widgets are not shown on the page. */
export const ZAP_PLACES = ["main", "side", "bottom", "hidden"] as const;
export type ZapPlace = (typeof ZAP_PLACES)[number];

/** Icons a custom button can carry; the empty string is no icon. */
export const ZAP_BUTTON_ICONS = [
  "play",
  "pause",
  "stop",
  "next",
  "volume",
  "mute",
  "gamepad",
  "tv",
  "save",
  "folder",
  "power",
  "refresh",
  "home",
  "star",
  "music",
  "zap",
] as const;
export type ZapButtonIcon = (typeof ZAP_BUTTON_ICONS)[number] | "";

export const ZAP_BUTTON_STYLES = [
  "primary",
  "secondary",
  "destructive",
] as const;
export type ZapButtonStyle = (typeof ZAP_BUTTON_STYLES)[number];

/**
 * How much room a button takes: small is a quarter of the row, medium a half,
 * and large the full row at a taller height.
 */
export const ZAP_BUTTON_SIZES = ["small", "medium", "large"] as const;
export type ZapButtonSize = (typeof ZAP_BUTTON_SIZES)[number];

/** A button that runs ZapScript when pressed. */
export interface ZapButton {
  id: string;
  label: string;
  icon: ZapButtonIcon;
  style: ZapButtonStyle;
  size: ZapButtonSize;
  script: string;
  /** Ask before running, for scripts that are unwelcome to run by accident. */
  confirm: boolean;
}

/** Library collections a custom row can show (Favorites and Recently played are built in). */
export const ZAP_COLLECTIONS = [
  "top",
  "liked",
  "disliked",
  "playLater",
] as const;
export type ZapCollectionName = (typeof ZAP_COLLECTIONS)[number];

/** What a custom collection row shows: a library collection, or a deck. */
export type ZapCollectionSource =
  | { kind: "collection"; collection: ZapCollectionName }
  | { kind: "deck"; deckId: string };

/** A row of covers from a collection or deck, like Favorites. */
export interface ZapCollection {
  id: string;
  source: ZapCollectionSource;
  /** Heading for the row; empty uses the source's own name. */
  title: string;
}

/**
 * One device's arrangement of the Zap page: where each widget sits, and the
 * custom buttons that are among them. One self-contained object per device so
 * it can be copied between devices, and later backed up, as a unit.
 */
export interface ZapLayout {
  version: 1;
  places: Record<ZapPlace, ZapWidgetId[]>;
  buttons: Record<string, ZapButton>;
  collections: Record<string, ZapCollection>;
}

export const DEFAULT_ZAP_LAYOUT: ZapLayout = {
  version: 1,
  places: {
    main: ["nowPlaying", "scan"],
    side: ["controls", "readers"],
    bottom: ["favourites", "recents"],
    hidden: [],
  },
  buttons: {},
  collections: {},
};

const BUTTON_PREFIX = "button:";
const COLLECTION_PREFIX = "collection:";

export function zapButtonWidgetId(id: string): ZapButtonWidgetId {
  return `${BUTTON_PREFIX}${id}`;
}

export function isZapButtonWidget(id: ZapWidgetId): id is ZapButtonWidgetId {
  return id.startsWith(BUTTON_PREFIX);
}

/** A button's share of a row, in twelfths. */
export function zapButtonSpan(button: ZapButton): 3 | 6 | 12 {
  return button.size === "small" ? 3 : button.size === "medium" ? 6 : 12;
}

export function zapCollectionWidgetId(id: string): ZapCollectionWidgetId {
  return `${COLLECTION_PREFIX}${id}`;
}

export function isZapCollectionWidget(
  id: ZapWidgetId,
): id is ZapCollectionWidgetId {
  return id.startsWith(COLLECTION_PREFIX);
}

export function zapCollectionOf(
  layout: ZapLayout,
  id: ZapWidgetId,
): ZapCollection | null {
  return isZapCollectionWidget(id)
    ? (layout.collections[id.slice(COLLECTION_PREFIX.length)] ?? null)
    : null;
}

export function zapButtonOf(
  layout: ZapLayout,
  id: ZapWidgetId,
): ZapButton | null {
  return isZapButtonWidget(id)
    ? (layout.buttons[id.slice(BUTTON_PREFIX.length)] ?? null)
    : null;
}

function copyLayout(layout: ZapLayout): ZapLayout {
  return {
    version: 1,
    places: {
      main: [...layout.places.main],
      side: [...layout.places.side],
      bottom: [...layout.places.bottom],
      hidden: [...layout.places.hidden],
    },
    buttons: { ...layout.buttons },
    collections: { ...layout.collections },
  };
}

export function defaultZapLayout(): ZapLayout {
  return copyLayout(DEFAULT_ZAP_LAYOUT);
}

function defaultPlaceOf(id: ZapBuiltinWidgetId): ZapPlace {
  return ZAP_PLACES.find((place) =>
    (DEFAULT_ZAP_LAYOUT.places[place] as ZapWidgetId[]).includes(id),
  ) as ZapPlace;
}

const isBuiltinId = (value: unknown): value is ZapBuiltinWidgetId =>
  typeof value === "string" &&
  (ZAP_BUILTIN_WIDGET_IDS as readonly string[]).includes(value);

const oneOf = <T extends string | number>(
  options: readonly T[],
  value: unknown,
  fallback: T,
): T => (options.includes(value as T) ? (value as T) : fallback);

/** Reads one stored button, repairing what it can; null when it is unusable. */
function normaliseButton(id: string, value: unknown): ZapButton | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  return {
    id,
    label: typeof raw.label === "string" ? raw.label : "",
    icon: oneOf<ZapButtonIcon>(["", ...ZAP_BUTTON_ICONS], raw.icon, ""),
    style: oneOf(ZAP_BUTTON_STYLES, raw.style, "secondary"),
    size: oneOf(ZAP_BUTTON_SIZES, raw.size, "medium"),
    script: typeof raw.script === "string" ? raw.script : "",
    confirm: raw.confirm === true,
  };
}

/** Reads one stored collection row; null when it is unusable. */
function normaliseCollection(id: string, value: unknown): ZapCollection | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  const stored = raw.source as Record<string, unknown> | undefined;
  let source: ZapCollectionSource = { kind: "collection", collection: "top" };
  if (stored && stored.kind === "deck") {
    if (typeof stored.deckId !== "string" || stored.deckId === "") return null;
    source = { kind: "deck", deckId: stored.deckId };
  } else if (stored && stored.kind === "collection") {
    source = {
      kind: "collection",
      collection: oneOf(ZAP_COLLECTIONS, stored.collection, "top"),
    };
  }
  return {
    id,
    source,
    title: typeof raw.title === "string" ? raw.title : "",
  };
}

/**
 * Reads a stored layout. Unknown and repeated widgets are dropped, buttons
 * whose definition is gone are dropped, a button placed nowhere goes to
 * `hidden` so it is not lost, and any built-in widget the stored layout
 * predates joins its default place, so widgets added in later versions appear
 * without the user doing anything. Anything that is not a layout returns null,
 * which means "use the built-in default".
 */
export function normaliseZapLayout(value: unknown): ZapLayout | null {
  if (typeof value !== "object" || value === null) return null;
  const {
    places,
    buttons: storedButtons,
    collections: storedCollections,
  } = value as {
    places?: unknown;
    buttons?: unknown;
    collections?: unknown;
  };
  if (typeof places !== "object" || places === null) return null;

  const buttons: Record<string, ZapButton> = {};
  if (typeof storedButtons === "object" && storedButtons !== null) {
    for (const [id, stored] of Object.entries(storedButtons)) {
      const button = normaliseButton(id, stored);
      if (button) buttons[id] = button;
    }
  }

  const collections: Record<string, ZapCollection> = {};
  if (typeof storedCollections === "object" && storedCollections !== null) {
    for (const [id, stored] of Object.entries(storedCollections)) {
      const collection = normaliseCollection(id, stored);
      if (collection) collections[id] = collection;
    }
  }

  const layout: ZapLayout = {
    version: 1,
    places: { main: [], side: [], bottom: [], hidden: [] },
    buttons,
    collections,
  };
  const seen = new Set<ZapWidgetId>();
  for (const place of ZAP_PLACES) {
    const ids = (places as Record<string, unknown>)[place];
    if (!Array.isArray(ids)) continue;
    for (const id of ids) {
      if (typeof id !== "string") continue;
      const known =
        isBuiltinId(id) ||
        (id.startsWith(BUTTON_PREFIX) &&
          id.slice(BUTTON_PREFIX.length) in buttons) ||
        (id.startsWith(COLLECTION_PREFIX) &&
          id.slice(COLLECTION_PREFIX.length) in collections);
      if (!known || seen.has(id as ZapWidgetId)) continue;
      seen.add(id as ZapWidgetId);
      layout.places[place].push(id as ZapWidgetId);
    }
  }
  for (const id of ZAP_BUILTIN_WIDGET_IDS) {
    if (!seen.has(id)) layout.places[defaultPlaceOf(id)].push(id);
  }
  for (const id of Object.keys(buttons)) {
    const widget = zapButtonWidgetId(id);
    if (!seen.has(widget)) layout.places.hidden.push(widget);
  }
  for (const id of Object.keys(collections)) {
    const widget = zapCollectionWidgetId(id);
    if (!seen.has(widget)) layout.places.hidden.push(widget);
  }
  return layout;
}

/** Reads every stored device's layout, keeping the ones that are usable. */
export function normaliseZapLayouts(value: unknown): Record<string, ZapLayout> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  const layouts: Record<string, ZapLayout> = {};
  for (const [deviceKey, stored] of Object.entries(value)) {
    const layout = normaliseZapLayout(stored);
    if (layout) layouts[deviceKey] = layout;
  }
  return layouts;
}

export function isDefaultZapLayout(layout: ZapLayout): boolean {
  return (
    Object.keys(layout.buttons).length === 0 &&
    Object.keys(layout.collections).length === 0 &&
    ZAP_PLACES.every((place) => {
      const ids = layout.places[place];
      const defaults = DEFAULT_ZAP_LAYOUT.places[place];
      return (
        ids.length === defaults.length &&
        ids.every((id, index) => id === defaults[index])
      );
    })
  );
}

export function findZapPlace(
  layout: ZapLayout,
  id: ZapWidgetId,
): { place: ZapPlace; index: number } {
  for (const place of ZAP_PLACES) {
    const index = layout.places[place].indexOf(id);
    if (index !== -1) return { place, index };
  }
  // Layouts are normalised, so every widget is placed.
  return { place: "hidden", index: 0 };
}

/** Puts a widget at `index` of `place`, removing it from wherever it was. */
export function moveZapWidget(
  layout: ZapLayout,
  id: ZapWidgetId,
  place: ZapPlace,
  index: number,
): ZapLayout {
  const next = copyLayout(layout);
  for (const key of ZAP_PLACES) {
    next.places[key] = next.places[key].filter((other) => other !== id);
  }
  const target = next.places[place];
  const at = Math.max(0, Math.min(index, target.length));
  target.splice(at, 0, id);
  return next;
}

/**
 * Moves a widget one step through the visible places in reading order (main,
 * then side, then bottom), crossing into the neighbouring place at an end.
 * It never enters or leaves `hidden`; those are Hide and Show.
 */
export function moveZapWidgetBy(
  layout: ZapLayout,
  id: ZapWidgetId,
  direction: -1 | 1,
): ZapLayout {
  const { place, index } = findZapPlace(layout, id);
  if (place === "hidden") return layout;
  const order = ZAP_PLACES.filter((p) => p !== "hidden");
  const length = layout.places[place].length;
  const target = index + direction;
  if (target >= 0 && target < length) {
    return moveZapWidget(layout, id, place, target);
  }
  const neighbour = order[order.indexOf(place) + direction];
  if (!neighbour) return layout;
  return moveZapWidget(
    layout,
    id,
    neighbour,
    direction === 1 ? 0 : layout.places[neighbour].length,
  );
}

export function hideZapWidget(layout: ZapLayout, id: ZapWidgetId): ZapLayout {
  return moveZapWidget(layout, id, "hidden", layout.places.hidden.length);
}

/**
 * Brings a hidden widget back: a built-in to the end of its default place, a
 * button to the end of the main column, a collection row to the end of the
 * full-width area.
 */
export function showZapWidget(layout: ZapLayout, id: ZapWidgetId): ZapLayout {
  const place = isZapButtonWidget(id)
    ? "main"
    : isZapCollectionWidget(id)
      ? "bottom"
      : defaultPlaceOf(id);
  return moveZapWidget(layout, id, place, layout.places[place].length);
}

/** Adds a button at the end of a place, or replaces the one with its id. */
export function saveZapButton(
  layout: ZapLayout,
  button: ZapButton,
  place: ZapPlace = "main",
): ZapLayout {
  const widget = zapButtonWidgetId(button.id);
  const next = copyLayout(layout);
  const isNew = !(button.id in layout.buttons);
  next.buttons[button.id] = button;
  return isNew
    ? moveZapWidget(next, widget, place, next.places[place].length)
    : next;
}

/** Removes a button and its place in the layout. */
export function deleteZapButton(layout: ZapLayout, id: string): ZapLayout {
  const widget = zapButtonWidgetId(id);
  const next = copyLayout(layout);
  delete next.buttons[id];
  for (const place of ZAP_PLACES) {
    next.places[place] = next.places[place].filter((other) => other !== widget);
  }
  return next;
}

/** Adds a collection row at the end of a place, or replaces the one with its id. */
export function saveZapCollection(
  layout: ZapLayout,
  collection: ZapCollection,
  place: ZapPlace = "bottom",
): ZapLayout {
  const widget = zapCollectionWidgetId(collection.id);
  const next = copyLayout(layout);
  const isNew = !(collection.id in layout.collections);
  next.collections[collection.id] = collection;
  return isNew
    ? moveZapWidget(next, widget, place, next.places[place].length)
    : next;
}

/** Removes a collection row and its place in the layout. */
export function deleteZapCollection(layout: ZapLayout, id: string): ZapLayout {
  const widget = zapCollectionWidgetId(id);
  const next = copyLayout(layout);
  delete next.collections[id];
  for (const place of ZAP_PLACES) {
    next.places[place] = next.places[place].filter((other) => other !== widget);
  }
  return next;
}

export function newZapCollection(id: string): ZapCollection {
  return { id, source: { kind: "collection", collection: "top" }, title: "" };
}

export function newZapButton(id: string): ZapButton {
  return {
    id,
    label: "",
    icon: "",
    style: "secondary",
    size: "medium",
    script: "",
    confirm: false,
  };
}

/**
 * A copy of a layout for another device. Buttons and collection rows get new
 * ids, so the two devices never share one, and the copy can be edited on its own.
 */
export function cloneZapLayout(
  layout: ZapLayout,
  makeId: () => string,
): ZapLayout {
  const renamed = new Map<string, string>();
  const buttons: Record<string, ZapButton> = {};
  for (const [id, button] of Object.entries(layout.buttons)) {
    const fresh = makeId();
    renamed.set(zapButtonWidgetId(id), zapButtonWidgetId(fresh));
    buttons[fresh] = { ...button, id: fresh };
  }
  const collections: Record<string, ZapCollection> = {};
  for (const [id, collection] of Object.entries(layout.collections)) {
    const fresh = makeId();
    renamed.set(zapCollectionWidgetId(id), zapCollectionWidgetId(fresh));
    collections[fresh] = { ...collection, id: fresh };
  }
  const rename = (id: ZapWidgetId): ZapWidgetId =>
    (renamed.get(id) as ZapWidgetId | undefined) ?? id;
  return {
    version: 1,
    places: {
      main: layout.places.main.map(rename),
      side: layout.places.side.map(rename),
      bottom: layout.places.bottom.map(rename),
      hidden: layout.places.hidden.map(rename),
    },
    buttons,
    collections,
  };
}

/** A fresh id for a button. */
export function newZapButtonId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
  );
}
