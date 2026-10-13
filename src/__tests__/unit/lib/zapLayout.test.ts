import { describe, expect, it } from "vitest";
import {
  DEFAULT_ZAP_LAYOUT,
  ZAP_BUILTIN_WIDGET_IDS,
  defaultZapLayout,
  findZapPlace,
  hideZapWidget,
  cloneZapLayout,
  deleteZapButton,
  isDefaultZapLayout,
  deleteZapCollection,
  newZapButton,
  newZapCollection,
  saveZapCollection,
  zapCollectionOf,
  zapCollectionWidgetId,
  saveZapButton,
  zapButtonOf,
  zapButtonWidgetId,
  moveZapWidget,
  moveZapWidgetBy,
  normaliseZapLayout,
  showZapWidget,
  type ZapLayout,
} from "@/lib/zapLayout";

const placed = (layout: ZapLayout) =>
  Object.values(layout.places).flat().sort();

const runButton = (id: string) => ({
  ...newZapButton(id),
  label: "Pause",
  script: "**stop",
});

describe("zapLayout", () => {
  describe("normaliseZapLayout", () => {
    it("should keep a valid layout as stored", () => {
      const stored = moveZapWidget(defaultZapLayout(), "readers", "main", 0);
      expect(normaliseZapLayout(stored)).toEqual(stored);
    });

    it.each([null, undefined, 4, "layout", [], {}, { places: 3 }])(
      "should treat %j as no layout",
      (value) => {
        expect(normaliseZapLayout(value)).toBeNull();
      },
    );

    it("should drop unknown and repeated widgets", () => {
      const layout = normaliseZapLayout({
        places: {
          main: ["scan", "clock", "scan"],
          side: ["scan", "controls"],
          bottom: "favourites",
        },
      });
      expect(layout?.places.main).toEqual(["scan", "nowPlaying"]);
      expect(layout?.places.side).toEqual(["controls", "readers"]);
      expect(placed(layout as ZapLayout)).toEqual(
        [...ZAP_BUILTIN_WIDGET_IDS].sort(),
      );
    });

    it("should place widgets a stored layout predates in their default place", () => {
      const layout = normaliseZapLayout({
        places: { main: ["scan"], side: [], bottom: [], hidden: [] },
      });
      expect(layout?.places).toEqual({
        main: ["scan", "nowPlaying"],
        side: ["controls", "readers"],
        bottom: ["favourites", "recents"],
        hidden: [],
      });
    });
  });

  describe("moving", () => {
    it("should move a widget to a place and index without losing any widget", () => {
      const moved = moveZapWidget(defaultZapLayout(), "readers", "main", 1);
      expect(moved.places.main).toEqual(["nowPlaying", "readers", "scan"]);
      expect(moved.places.side).toEqual(["controls"]);
      expect(placed(moved)).toEqual([...ZAP_BUILTIN_WIDGET_IDS].sort());
    });

    it("should not change the layout it was given", () => {
      const layout = defaultZapLayout();
      moveZapWidget(layout, "scan", "bottom", 0);
      expect(layout).toEqual(DEFAULT_ZAP_LAYOUT);
    });

    it("should step within a place and cross into the next at its end", () => {
      let layout = defaultZapLayout();
      layout = moveZapWidgetBy(layout, "nowPlaying", 1);
      expect(layout.places.main).toEqual(["scan", "nowPlaying"]);
      layout = moveZapWidgetBy(layout, "nowPlaying", 1);
      expect(findZapPlace(layout, "nowPlaying")).toEqual({
        place: "side",
        index: 0,
      });
      layout = moveZapWidgetBy(layout, "nowPlaying", -1);
      expect(findZapPlace(layout, "nowPlaying")).toEqual({
        place: "main",
        index: 1,
      });
    });

    it("should stop at the first and last visible places", () => {
      const first = defaultZapLayout();
      expect(moveZapWidgetBy(first, "nowPlaying", -1)).toEqual(first);
      const last = defaultZapLayout();
      expect(moveZapWidgetBy(last, "recents", 1)).toEqual(last);
    });

    it("should hide a widget and bring it back to its default place", () => {
      const hidden = hideZapWidget(defaultZapLayout(), "controls");
      expect(hidden.places.hidden).toEqual(["controls"]);
      expect(hidden.places.side).toEqual(["readers"]);
      expect(moveZapWidgetBy(hidden, "controls", 1)).toEqual(hidden);
      expect(showZapWidget(hidden, "controls")).toEqual({
        ...hidden,
        places: { ...hidden.places, hidden: [], side: ["readers", "controls"] },
      });
    });
  });

  it("should recognise the default layout only when order and places match", () => {
    expect(isDefaultZapLayout(defaultZapLayout())).toBe(true);
    expect(
      isDefaultZapLayout(moveZapWidgetBy(defaultZapLayout(), "scan", -1)),
    ).toBe(false);
    expect(isDefaultZapLayout(hideZapWidget(defaultZapLayout(), "scan"))).toBe(
      false,
    );
  });

  describe("buttons", () => {
    it("should add a new button to the end of the chosen place", () => {
      const layout = saveZapButton(defaultZapLayout(), runButton("a"), "side");

      expect(layout.places.side).toEqual([
        "controls",
        "readers",
        zapButtonWidgetId("a"),
      ]);
      expect(zapButtonOf(layout, zapButtonWidgetId("a"))?.label).toBe("Pause");
      expect(isDefaultZapLayout(layout)).toBe(false);
    });

    it("should change an existing button without moving it", () => {
      const first = saveZapButton(defaultZapLayout(), runButton("a"), "bottom");
      const changed = saveZapButton(first, {
        ...runButton("a"),
        label: "Stop",
      });

      expect(changed.places).toEqual(first.places);
      expect(changed.buttons.a?.label).toBe("Stop");
    });

    it("should remove a deleted button from the layout entirely", () => {
      const layout = deleteZapButton(
        saveZapButton(defaultZapLayout(), runButton("a")),
        "a",
      );

      expect(layout).toEqual(defaultZapLayout());
      expect(isDefaultZapLayout(layout)).toBe(true);
    });

    it("should read stored buttons, repairing what is wrong with them", () => {
      const layout = normaliseZapLayout({
        places: { main: ["button:a", "button:gone"] },
        buttons: {
          a: {
            label: "Mute",
            script: "**mute",
            size: "huge",
            style: "outline",
          },
          b: { label: "Unplaced", script: "x" },
          c: "nonsense",
        },
      });

      expect(layout?.places.main).toEqual(["button:a", "nowPlaying", "scan"]);
      expect(layout?.places.hidden).toEqual(["button:b"]);
      expect(layout?.buttons.a).toMatchObject({
        id: "a",
        label: "Mute",
        size: "medium",
        style: "secondary",
        confirm: false,
      });
      expect(layout?.buttons.c).toBeUndefined();
    });

    it("should copy a layout with new button ids so devices never share one", () => {
      let next = 0;
      const source = saveZapButton(defaultZapLayout(), runButton("a"), "side");

      const copy = cloneZapLayout(source, () => `copy-${(next += 1)}`);

      expect(copy.places.side).toEqual([
        "controls",
        "readers",
        "button:copy-1",
      ]);
      expect(Object.keys(copy.buttons)).toEqual(["copy-1"]);
      expect(copy.buttons["copy-1"]).toMatchObject({
        id: "copy-1",
        label: "Pause",
        script: "**stop",
      });
      expect(Object.keys(source.buttons)).toEqual(["a"]);
    });

    it("should move buttons through the places like any other widget", () => {
      let layout = saveZapButton(defaultZapLayout(), runButton("a"), "main");
      layout = moveZapWidgetBy(layout, zapButtonWidgetId("a"), 1);

      expect(findZapPlace(layout, zapButtonWidgetId("a"))).toEqual({
        place: "side",
        index: 0,
      });
    });
  });

  describe("collection rows", () => {
    it("should add a collection row to the end of the full-width area", () => {
      const layout = saveZapCollection(defaultZapLayout(), {
        ...newZapCollection("row"),
        source: { kind: "deck", deckId: "7" },
      });

      expect(layout.places.bottom).toEqual([
        "favourites",
        "recents",
        zapCollectionWidgetId("row"),
      ]);
      expect(
        zapCollectionOf(layout, zapCollectionWidgetId("row"))?.source,
      ).toEqual({
        kind: "deck",
        deckId: "7",
      });
      expect(isDefaultZapLayout(layout)).toBe(false);
    });

    it("should remove a deleted collection row from the layout entirely", () => {
      const layout = deleteZapCollection(
        saveZapCollection(defaultZapLayout(), newZapCollection("row")),
        "row",
      );

      expect(layout).toEqual(defaultZapLayout());
    });

    it("should read stored collection rows, repairing or dropping bad ones", () => {
      const layout = normaliseZapLayout({
        places: { bottom: ["collection:a", "collection:gone"] },
        collections: {
          a: {
            source: { kind: "collection", collection: "nonsense" },
            title: 4,
          },
          b: { source: { kind: "deck", deckId: "9" }, title: "Deck" },
          c: { source: { kind: "deck" } },
          d: "nonsense",
        },
      });

      expect(layout?.collections.a).toEqual({
        id: "a",
        source: { kind: "collection", collection: "top" },
        title: "",
      });
      expect(layout?.collections.b?.source).toEqual({
        kind: "deck",
        deckId: "9",
      });
      expect(layout?.collections.c).toBeUndefined();
      expect(layout?.collections.d).toBeUndefined();
      expect(layout?.places.bottom).toContain("collection:a");
      expect(layout?.places.bottom).not.toContain("collection:gone");
      expect(layout?.places.hidden).toEqual(["collection:b"]);
    });

    it("should give copied collection rows new ids", () => {
      let next = 0;
      const source = saveZapCollection(
        defaultZapLayout(),
        newZapCollection("row"),
      );

      const copy = cloneZapLayout(source, () => `copy-${(next += 1)}`);

      expect(Object.keys(copy.collections)).toEqual(["copy-1"]);
      expect(copy.places.bottom).toContain("collection:copy-1");
      expect(Object.keys(source.collections)).toEqual(["row"]);
    });
  });
});
