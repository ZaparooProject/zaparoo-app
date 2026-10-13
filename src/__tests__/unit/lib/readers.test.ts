import { describe, expect, it } from "vitest";
import { sortReaders } from "@/lib/readers";
import { mockReaderInfo } from "@/test-utils/factories";

describe("sortReaders", () => {
  it("sorts displayed names naturally without mutating API data", () => {
    const readers = [
      mockReaderInfo({ id: "ten", info: "Reader 10" }),
      mockReaderInfo({ id: "alpha", info: "Alpha" }),
      mockReaderInfo({ id: "two", info: "Reader 2" }),
    ];
    expect(sortReaders(readers).map((reader) => reader.id)).toEqual([
      "alpha",
      "two",
      "ten",
    ]);
    expect(readers.map((reader) => reader.id)).toEqual(["ten", "alpha", "two"]);
  });

  it("uses reader identity for identical names, regardless of API order or state", () => {
    const readers = [
      mockReaderInfo({
        id: "legacy-a",
        readerId: "reader-b",
        info: "Same",
        connected: true,
      }),
      mockReaderInfo({
        id: "legacy-z",
        readerId: "reader-a",
        info: "Same",
        connected: false,
      }),
    ];
    expect(sortReaders(readers).map((reader) => reader.readerId)).toEqual([
      "reader-a",
      "reader-b",
    ]);
    expect(
      sortReaders(
        [...readers]
          .reverse()
          .map((reader) => ({ ...reader, connected: !reader.connected })),
      ).map((reader) => reader.readerId),
    ).toEqual(["reader-a", "reader-b"]);
  });

  it("falls back to legacy id for missing names and canonical identity", () => {
    const readers = [
      mockReaderInfo({ id: "reader-10", info: "" }),
      mockReaderInfo({ id: "reader-2", info: "" }),
    ];
    expect(sortReaders(readers).map((reader) => reader.id)).toEqual([
      "reader-2",
      "reader-10",
    ]);
  });
});
