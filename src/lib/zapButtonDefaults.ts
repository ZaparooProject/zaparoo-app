import { parseZapScript } from "@/lib/zapscript/script";
import { zapCommand } from "@/lib/zapscript/catalog";
import type { ZapButtonIcon } from "@/lib/zapLayout";

/** The name a media launch should wear: the title, not its path or system. */
function mediaTitle(text: string): string {
  const withoutOptions = text.trim().replace(/^@/, "").split("?")[0] ?? "";
  const lastPart = withoutOptions.split(/[\\/]/).pop() ?? "";
  return (
    lastPart
      .replace(/\.[A-Za-z0-9]{1,4}$/, "")
      // Tags and regions written after the title, as `(region:us)` or `(USA)`.
      .replace(/(\s*\([^)]*\))+\s*$/, "")
      .trim()
  );
}

const ICONS: Record<string, ZapButtonIcon> = {
  launch: "play",
  "launch.title": "play",
  "launch.system": "play",
  "launch.search": "play",
  "launch.last": "play",
  "launch.random": "zap",
  stop: "stop",
  "playlist.stop": "stop",
  "playlist.play": "play",
  "playlist.pause": "pause",
  "playlist.next": "next",
  "input.keyboard": "gamepad",
  "input.gamepad": "gamepad",
  "input.text": "gamepad",
};

/**
 * What a button can be called and drawn as, read from the script it runs, so a
 * button left unnamed is not left blank. Nothing is suggested when the script
 * cannot be read.
 */
export function suggestZapButton(
  script: string,
  describe: (translationKey: string) => string,
): { label: string; icon: ZapButtonIcon } {
  const none = { label: "", icon: "" as ZapButtonIcon };
  const parsed = parseZapScript(script);
  const step = parsed.ok ? parsed.steps[0] : undefined;
  if (!step) return none;
  // `@System/Title` is written as it stands; it is a media launch by title.
  if (step.raw) {
    const title = step.args[0]?.trim().startsWith("@")
      ? mediaTitle(step.args[0])
      : "";
    return title ? { label: title, icon: "play" } : none;
  }
  const spec = zapCommand(step.name);
  if (!spec) return none;

  const media =
    (step.name === "launch" || step.name === "launch.title") && step.args[0]
      ? mediaTitle(step.args[0])
      : "";
  return {
    label: media || describe(spec.description),
    icon: ICONS[step.name] ?? "",
  };
}
