import { describe, expect, it } from "vitest";
import {
  createZapStep,
  parseZapScript,
  quoteZapArgument,
  serializeZapScript,
  writeZapStep,
  type ZapStep,
} from "@/lib/zapscript/script";

const parse = (text: string) => {
  const result = parseZapScript(text);
  if (!result.ok) throw new Error(`could not split: ${text}`);
  return result.steps;
};
const shape = (steps: ZapStep[]) =>
  steps.map(({ name, args, advArgs, raw, bare }) => ({
    name,
    args,
    advArgs,
    ...(raw ? { raw } : {}),
    ...(bare ? { bare } : {}),
  }));
/** A step as the builder leaves it after an edit: no original text. */
const edited = (step: ZapStep): ZapStep => ({ ...step, source: undefined });

describe("parseZapScript", () => {
  it("reads commands, arguments and advanced arguments", () => {
    expect(
      shape(
        parse(
          "**launch.random:snes,genesis?launcher=retroarch&action=run||**delay:500||**stop",
        ),
      ),
    ).toEqual([
      {
        name: "launch.random",
        args: ["snes", "genesis"],
        advArgs: [
          ["launcher", "retroarch"],
          ["action", "run"],
        ],
      },
      { name: "delay", args: ["500"], advArgs: [] },
      { name: "stop", args: [], advArgs: [] },
    ]);
  });

  it("reads plain media text as a launch", () => {
    expect(shape(parse("/roms/snes/Super Mario, World.sfc"))).toEqual([
      {
        name: "launch",
        args: ["/roms/snes/Super Mario, World.sfc"],
        advArgs: [],
        bare: true,
      },
    ]);
    expect(shape(parse("SNES/game.sfc?launcher=snes9x"))).toEqual([
      {
        name: "launch",
        args: ["SNES/game.sfc"],
        advArgs: [["launcher", "snes9x"]],
        bare: true,
      },
    ]);
  });

  it("lower-cases command names and trims arguments", () => {
    expect(shape(parse("**Launch.System: snes "))).toEqual([
      { name: "launch.system", args: ["snes"], advArgs: [] },
    ]);
  });

  it("decodes quoted arguments and escapes", () => {
    expect(shape(parse('**echo:"a, b",c^,d||**ui.notice:^"hi^"'))).toEqual([
      { name: "echo", args: ["a, b", "c,d"], advArgs: [] },
      { name: "ui.notice", args: ['"hi"'], advArgs: [] },
    ]);
  });

  it("treats a single pipe and an invalid advanced-argument name as text", () => {
    expect(shape(parse("**echo:a|b||**echo:what? no"))).toEqual([
      { name: "echo", args: ["a|b"], advArgs: [] },
      { name: "echo", args: ["what? no"], advArgs: [] },
    ]);
  });

  it("keeps key macros and typed text exactly as written", () => {
    expect(
      shape(
        parse(
          "**input.keyboard:{f12}hello\\?{enter}?delay=5||**input.text:a,b ?c",
        ),
      ),
    ).toEqual([
      {
        name: "input.keyboard",
        args: ["{f12}hello\\?{enter}"],
        advArgs: [["delay", "5"]],
      },
      { name: "input.text", args: ["a,b ?c"], advArgs: [] },
    ]);
  });

  it.each([
    [
      "an escaped bracket that would read as an expression",
      "**echo:^[[x]]||**stop",
    ],
    ["a JSON argument", '**http.post:http://x,{"a":"b||c"}||**stop'],
    ["media title shorthand", "@SNES/Super Mario World||**stop"],
  ])("keeps %s as a text step beside ordinary ones", (_name, text) => {
    const steps = parse(text);
    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatchObject({ raw: true, name: "" });
    expect(steps[0]!.args[0]).toBe(text.slice(0, text.lastIndexOf("||")));
    expect(steps[1]).toMatchObject({ name: "stop" });
  });

  it.each([
    ["trait shorthand", "#lang=en **launch.system:snes"],
    ["a reserved JSON script", '{"cmds":[]}'],
    ["an unmatched quote", '**echo:"abc||**stop'],
    ["an unmatched expression", "**echo:[[abc||**stop"],
  ])("does not split %s", (_name, text) => {
    expect(parseZapScript(text)).toEqual({ ok: false, steps: [] });
  });

  it("reads nothing from empty text", () => {
    expect(parse("  \n ")).toEqual([]);
  });
});

describe("serializeZapScript", () => {
  it.each([
    "**launch.system:snes||**delay:500",
    "/roms/Game.sfc?launcher=x",
    '**echo:"a, b"   ||   **stop',
    "@SNES/Mario (USA)?launcher=x||**input.keyboard:{f12}",
    "**http.get:http://example.com/a?b=1",
  ])(
    "returns unedited text unchanged apart from separator spacing: %s",
    (text) => {
      expect(serializeZapScript(parse(text))).toBe(
        text.replace(/\s*\|\|\s*/g, (separator) =>
          separator.startsWith(" ") ? "   ||" : "||",
        ),
      );
    },
  );

  it("writes an edited step canonically and leaves the others alone", () => {
    const steps = parse('**Launch.System: snes ||**echo:"a, b"');
    steps[0] = edited({ ...steps[0]!, args: ["genesis"] });
    expect(serializeZapScript(steps)).toBe(
      '**launch.system:genesis||**echo:"a, b"',
    );
  });

  it("quotes values that would otherwise be read differently", () => {
    const write = (args: string[], advArgs: ZapStep["advArgs"] = []) =>
      writeZapStep({ ...createZapStep("echo", args), advArgs });
    expect(write(["a,b"])).toBe('**echo:"a,b"');
    expect(write(["why?"])).toBe('**echo:"why?"');
    expect(write([" padded"])).toBe('**echo:" padded"');
    expect(write(['say "hi"'])).toBe('**echo:say "hi"');
    expect(write(['"hi"'])).toBe('**echo:"^"hi^""');
    expect(write(["a||b"])).toBe('**echo:"a||b"');
    expect(write(["a", "", "c"])).toBe('**echo:a,"",c');
    expect(write(["a", "", ""])).toBe("**echo:a");
    expect(write(["a"], [["when", "x&y"]])).toBe('**echo:a?when="x&y"');
    expect(write(["a"], [["launcher", ""]])).toBe("**echo:a");
  });

  it("keeps an expression in the value it was written in", () => {
    expect(
      parse('**echo:"[[a, "b"]] and",x[[c||d]]?when=[[e&f]]||**stop'),
    ).toMatchObject([
      {
        name: "echo",
        args: ['[[a, "b"]] and', "x[[c||d]]"],
        advArgs: [["when", "[[e&f]]"]],
      },
      { name: "stop" },
    ]);
  });

  it("writes expressions as typed and leaves lone brackets alone", () => {
    const write = (args: string[], advArgs: ZapStep["advArgs"] = []) =>
      writeZapStep({ ...createZapStep("echo", args), advArgs });
    expect(write(["[[a,b?c]]"])).toBe("**echo:[[a,b?c]]");
    expect(write(['x, [[a "b"]]'])).toBe('**echo:"x, [[a "b"]]"');
    expect(write(["a"], [["when", "[[x && y]]"]])).toBe(
      "**echo:a?when=[[x && y]]",
    );
    expect(write(["Game [!].sfc"])).toBe("**echo:Game [!].sfc");
    // Not closed, so not an expression: escaped so the script still reads.
    expect(write(["[[open"])).toBe('**echo:"^[[open"');
    expect(parse(`${write(["[[open"])}||**stop`)).toHaveLength(2);
  });

  it("reads back every value it writes", () => {
    // Core trims every argument, quoted or not, so padding is not included.
    const values = [
      "a,b",
      "why?",
      '"q"',
      "a||b",
      "x^y",
      "[z",
      "t\tb",
      "[[e,f]]",
      "a [[g]] [!]",
    ];
    for (const value of values) {
      const step = { ...createZapStep("echo", [value, "end"]) };
      step.advArgs = [["when", value]];
      const [read] = parse(writeZapStep(step));
      expect(read).toMatchObject({
        name: "echo",
        args: [value, "end"],
        advArgs: [["when", value]],
      });
    }
  });

  it("keeps a launch as plain media text only while that is safe", () => {
    const [launch] = parse("SNES/game.sfc");
    expect(writeZapStep({ ...launch!, args: ["SNES/other, game.sfc"] })).toBe(
      "SNES/other, game.sfc",
    );
    expect(writeZapStep({ ...launch!, args: ["**odd"] })).toBe(
      "**launch:**odd",
    );
    expect(writeZapStep({ ...launch!, args: ["a?b"] })).toBe('**launch:"a?b"');
    expect(writeZapStep({ ...launch!, args: [""] })).toBe("**launch");
  });

  it("drops steps that write nothing", () => {
    const raw: ZapStep = { ...createZapStep("", [""]), raw: true };
    expect(serializeZapScript([raw, createZapStep("stop")])).toBe("**stop");
  });
});

describe("quoteZapArgument", () => {
  it("leaves a plain path as it is", () => {
    expect(quoteZapArgument("SNES/Super Mario World.sfc")).toBe(
      "SNES/Super Mario World.sfc",
    );
  });

  it.each(["SNES/Legend of Zelda, The.sfc", "NES/What?.nes", '"quoted'])(
    "quotes %s so it stays one argument",
    (path) => {
      const written = `**launch:${quoteZapArgument(path)}`;
      const steps = parse(written);
      expect(steps).toHaveLength(1);
      expect(steps[0]?.args).toEqual([path]);
    },
  );
});
