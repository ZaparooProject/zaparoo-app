import { describe, it, expect } from "vitest";
import { isValidExtension, filenameFromPath } from "@/lib/path";

describe("isValidExtension", () => {
  it("returns true for valid lowercase extensions", () => {
    expect(isValidExtension(".zip")).toBe(true);
    expect(isValidExtension(".sfc")).toBe(true);
    expect(isValidExtension(".nes")).toBe(true);
    expect(isValidExtension(".mp3")).toBe(true);
  });

  it("returns true for valid uppercase extensions", () => {
    expect(isValidExtension(".ZIP")).toBe(true);
    expect(isValidExtension(".Z64")).toBe(true);
    expect(isValidExtension(".SFC")).toBe(true);
  });

  it("returns true for extensions without leading dot", () => {
    expect(isValidExtension("zip")).toBe(true);
    expect(isValidExtension("Z64")).toBe(true);
  });

  it("returns true for extensions with numbers", () => {
    expect(isValidExtension(".7z")).toBe(true);
    expect(isValidExtension(".mp3")).toBe(true);
    expect(isValidExtension(".n64")).toBe(true);
  });

  it("returns false for empty string", () => {
    expect(isValidExtension("")).toBe(false);
  });

  it("returns false for just a dot", () => {
    expect(isValidExtension(".")).toBe(false);
  });

  it("returns false for extensions with hyphens", () => {
    expect(isValidExtension(".file-name")).toBe(false);
    expect(isValidExtension(".tar-gz")).toBe(false);
  });

  it("returns false for extensions with spaces", () => {
    expect(isValidExtension(".with space")).toBe(false);
    expect(isValidExtension(". ")).toBe(false);
  });

  it("returns false for extensions with underscores", () => {
    expect(isValidExtension(".file_name")).toBe(false);
  });

  it("returns false for extensions with special characters", () => {
    expect(isValidExtension(".file@name")).toBe(false);
    expect(isValidExtension(".file#name")).toBe(false);
    expect(isValidExtension(".file!")).toBe(false);
  });
});

describe("filenameFromPath", () => {
  it("extracts filename from Unix paths", () => {
    expect(filenameFromPath("/games/snes/Super Mario World.sfc")).toBe(
      "Super Mario World"
    );
    expect(filenameFromPath("/roms/nes/Zelda.nes")).toBe("Zelda");
  });

  it("extracts filename from Windows paths", () => {
    expect(filenameFromPath("C:\\Games\\Mario Kart 64.z64")).toBe(
      "Mario Kart 64"
    );
    expect(filenameFromPath("D:\\ROMs\\SNES\\Final Fantasy III.sfc")).toBe(
      "Final Fantasy III"
    );
  });

  it("handles custom tags in parentheses", () => {
    expect(filenameFromPath("/roms/Game (USA) (Rev 1).zip")).toBe(
      "Game (USA) (Rev 1)"
    );
    expect(filenameFromPath("/roms/Game (Japan) (En).sfc")).toBe(
      "Game (Japan) (En)"
    );
  });

  it("handles custom tags in brackets", () => {
    expect(filenameFromPath("/roms/Game (USA) (Rev 1) [!].zip")).toBe(
      "Game (USA) (Rev 1) [!]"
    );
    expect(filenameFromPath("/roms/Game [T+Eng].nes")).toBe("Game [T+Eng]");
  });

  it("keeps invalid extensions as part of filename", () => {
    expect(filenameFromPath("/path/Name.Something Else")).toBe(
      "Name.Something Else"
    );
    expect(filenameFromPath("/path/Game.With-Hyphen")).toBe("Game.With-Hyphen");
  });

  it("returns empty string for empty input", () => {
    expect(filenameFromPath("")).toBe("");
  });

  it("handles paths with no extension", () => {
    expect(filenameFromPath("/path/to/filename")).toBe("filename");
    expect(filenameFromPath("C:\\path\\filename")).toBe("filename");
  });

  it("handles hidden files (dot at start)", () => {
    expect(filenameFromPath("/path/.gitignore")).toBe(".gitignore");
    expect(filenameFromPath("/path/.hidden")).toBe(".hidden");
  });

  it("handles just a filename with no path", () => {
    expect(filenameFromPath("Game.zip")).toBe("Game");
    expect(filenameFromPath("README")).toBe("README");
  });

  it("handles paths ending in slash", () => {
    expect(filenameFromPath("/path/to/")).toBe("");
    expect(filenameFromPath("C:\\path\\")).toBe("");
  });

  it("handles mixed path separators", () => {
    expect(filenameFromPath("C:\\Games/SNES\\Game.sfc")).toBe("Game");
  });
});
