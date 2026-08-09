import { describe, expect, it } from "vitest";
import type { System } from "@/lib/models";
import {
  filterSystemCatalog,
  systemHasIndexedMedia,
  systemManufacturers,
  systemReleaseYear,
  systemSubtitle,
} from "@/lib/systemFilters";

const systems: System[] = [
  {
    id: "NES",
    name: "Nintendo Entertainment System",
    category: "Nintendo",
    manufacturer: "Nintendo",
    releaseDate: "1983",
  },
  {
    id: "N64",
    name: "Nintendo 64",
    category: "Nintendo",
    manufacturer: "Nintendo",
    releaseDate: "1996-06-23",
  },
  {
    id: "PSX",
    name: "PlayStation",
    category: "Sony",
    manufacturer: "Sony",
    releaseDate: "1994",
  },
  { id: "UNKNOWN", name: "Unknown System", category: "Other" },
];

describe("system filters", () => {
  it("should exclude explicit zero media counts unless empty systems are included", () => {
    const countedSystems: System[] = [
      { id: "SNES", name: "Super Nintendo", mediaCount: 25 },
      { id: "3DO", name: "3DO", mediaCount: 0 },
      { id: "NES", name: "Nintendo Entertainment System" },
    ];

    const indexed = filterSystemCatalog(countedSystems, {
      category: "all",
      query: "",
    });
    const includingEmpty = filterSystemCatalog(countedSystems, {
      category: "all",
      query: "",
      includeEmptySystems: true,
    });

    expect(indexed.systems.map((system) => system.id)).toEqual(["NES", "SNES"]);
    expect(includingEmpty.systems.map((system) => system.id)).toEqual([
      "3DO",
      "NES",
      "SNES",
    ]);
    expect(systemHasIndexedMedia({ mediaCount: 1 })).toBe(true);
    expect(systemHasIndexedMedia({ mediaCount: 0 })).toBe(false);
    expect(systemHasIndexedMedia({})).toBe(true);
  });

  it("should combine manufacturer and release-period filters", () => {
    const result = filterSystemCatalog(systems, {
      category: "all",
      manufacturer: "Nintendo",
      query: "",
      releasePeriod: "1990s",
    });

    expect(result.systems.map((system) => system.id)).toEqual(["N64"]);
  });

  it("should sort known release years and leave missing years last", () => {
    const newest = filterSystemCatalog(systems, {
      category: "all",
      query: "",
      sort: "year-desc",
    });
    const oldest = filterSystemCatalog(systems, {
      category: "all",
      query: "",
      sort: "year-asc",
    });

    expect(newest.systems.map((system) => system.id)).toEqual([
      "N64",
      "PSX",
      "NES",
      "UNKNOWN",
    ]);
    expect(oldest.systems.map((system) => system.id)).toEqual([
      "NES",
      "PSX",
      "N64",
      "UNKNOWN",
    ]);
  });

  it("should normalize manufacturer options and release metadata", () => {
    expect(
      systemManufacturers([
        ...systems,
        { id: "NES-PAL", name: "NES PAL", manufacturer: " Nintendo " },
      ]),
    ).toEqual(["Nintendo", "Sony"]);
    expect(systemReleaseYear({ releaseDate: "1990-11-21" })).toBe(1990);
    expect(
      systemSubtitle({ manufacturer: "Nintendo", releaseDate: "1990-11-21" }),
    ).toBe("Nintendo · 1990");
  });
});
