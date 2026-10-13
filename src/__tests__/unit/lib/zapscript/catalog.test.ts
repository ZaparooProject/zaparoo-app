import { describe, expect, it } from "vitest";
import { ZAP_COMMANDS, zapCommand } from "@/lib/zapscript/catalog";
import commandNames from "@/lib/zapscript/commandNames.json";
import enUS from "@/translations/en-US.json";

function hasTranslation(key: string): boolean {
  let node: unknown = enUS.translation;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null || !(part in node)) {
      return false;
    }
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" && node.length > 0;
}

describe("ZapScript command catalogue", () => {
  it("should list exactly the commands Core's ZapScript library defines", () => {
    const catalogued = ZAP_COMMANDS.map((command) => command.name).sort();
    const expected = [
      ...commandNames.current,
      ...commandNames.deprecated,
    ].sort();

    expect(catalogued).toEqual(expected);
  });

  it("should mark exactly the deprecated commands as replaced", () => {
    const replaced = ZAP_COMMANDS.filter((command) => command.replacedBy)
      .map((command) => command.name)
      .sort();

    expect(replaced).toEqual([...commandNames.deprecated].sort());
  });

  it("should replace every deprecated command with a current one", () => {
    const invalid = ZAP_COMMANDS.filter(
      (command) =>
        command.replacedBy !== undefined &&
        !commandNames.current.includes(command.replacedBy),
    ).map((command) => command.name);

    expect(invalid).toEqual([]);
  });

  it("should have an en-US translation for every label and description", () => {
    const keys = ZAP_COMMANDS.flatMap((command) => [
      command.description,
      ...command.args.map((arg) => arg.label),
      ...(command.advArgs ?? []).map((advArg) => advArg.label),
    ]);
    const missing = [...new Set(keys)].filter((key) => !hasTranslation(key));

    expect(missing).toEqual([]);
  });

  it("should have a translated name for every group in use", () => {
    const missing = [...new Set(ZAP_COMMANDS.map((command) => command.group))]
      .map((group) => `zapscript.groups.${group}`)
      .filter((key) => !hasTranslation(key));

    expect(missing).toEqual([]);
  });

  it("should use unique argument ids within each command", () => {
    const duplicated = ZAP_COMMANDS.filter((command) => {
      const ids = command.args.map((arg) => arg.id);
      const names = (command.advArgs ?? []).map((advArg) => advArg.name);
      return (
        new Set(ids).size !== ids.length || new Set(names).size !== names.length
      );
    }).map((command) => command.name);

    expect(duplicated).toEqual([]);
  });

  it("should give every choice argument its options", () => {
    const withoutOptions = ZAP_COMMANDS.flatMap((command) =>
      [...command.args, ...(command.advArgs ?? [])]
        .filter((arg) => arg.kind === "choice" && !arg.options?.length)
        .map((arg) => `${command.name}:${"id" in arg ? arg.id : arg.name}`),
    );

    expect(withoutOptions).toEqual([]);
  });

  it("should only take the rest of the text in a command's last argument", () => {
    const misplaced = ZAP_COMMANDS.filter((command) =>
      command.args.slice(0, -1).some((arg) => arg.raw),
    ).map((command) => command.name);

    expect(misplaced).toEqual([]);
  });

  it("should look commands up regardless of case", () => {
    expect(zapCommand("Launch.Random")?.name).toBe("launch.random");
    expect(zapCommand("INPUT.KEYBOARD")?.name).toBe("input.keyboard");
    expect(zapCommand("not.a.command")).toBeUndefined();
  });
});
