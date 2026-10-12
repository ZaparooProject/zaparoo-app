import type {
  ZapAdvArgSpec,
  ZapArgSpec,
  ZapCommandSpec,
} from "@/lib/zapscript/types";

const description = (name: string) =>
  `zapscript.commands.${name.replaceAll(".", "_")}.description`;

const adv = {
  when: { name: "when", label: "zapscript.advArgs.when", kind: "text" },
  launcher: {
    name: "launcher",
    label: "zapscript.advArgs.launcher",
    kind: "launcher",
  },
  system: {
    name: "system",
    label: "zapscript.advArgs.system",
    kind: "system",
  },
  action: {
    name: "action",
    label: "zapscript.advArgs.action",
    kind: "choice",
    options: ["run", "details"],
  },
  name: { name: "name", label: "zapscript.advArgs.name", kind: "text" },
  preNotice: {
    name: "pre_notice",
    label: "zapscript.advArgs.pre_notice",
    kind: "text",
  },
  slot: {
    name: "slot",
    label: "zapscript.advArgs.slot",
    kind: "choice",
    options: ["primary", "background"],
  },
  tags: {
    name: "tags",
    label: "zapscript.advArgs.tags",
    kind: "text",
    example: "region:us",
  },
  setName: {
    name: "set_name",
    label: "zapscript.advArgs.set_name",
    kind: "text",
    platform: "mister",
  },
  setNameSameDir: {
    name: "set_name_same_dir",
    label: "zapscript.advArgs.set_name_same_dir",
    kind: "text",
    platform: "mister",
  },
  mode: {
    name: "mode",
    label: "zapscript.advArgs.mode",
    kind: "choice",
    options: ["shuffle"],
  },
  repeat: {
    name: "repeat",
    label: "zapscript.advArgs.repeat",
    kind: "choice",
    options: ["off", "all", "one"],
  },
  speed: {
    name: "speed",
    label: "zapscript.advArgs.speed",
    kind: "text",
    example: "100ms",
  },
  hidden: {
    name: "hidden",
    label: "zapscript.advArgs.hidden",
    kind: "choice",
    options: ["true", "false"],
  },
  profile: {
    name: "profile",
    label: "zapscript.advArgs.profile",
    kind: "text",
  },
} as const satisfies Record<string, ZapAdvArgSpec>;

// Core checks `when` before any command runs, so every command it executes
// accepts it.
const whenOnly = [adv.when] as const;
const searchAdvArgs = [
  adv.launcher,
  adv.action,
  adv.tags,
  adv.slot,
  adv.setName,
  adv.setNameSameDir,
  adv.when,
] as const;
const playlistAdvArgs = [adv.mode, adv.repeat, adv.slot, adv.when] as const;
const slotAdvArgs = [adv.slot, adv.when] as const;
const macroAdvArgs = [adv.speed, adv.when] as const;

const systemArgs = [
  {
    id: "system",
    label: "zapscript.args.system",
    kind: "system",
    required: true,
    example: "snes",
  },
] as const satisfies readonly ZapArgSpec[];

// Also accepts `all`, several system IDs, a folder path or `system/search`,
// so the value is kept whole rather than split at commas.
const randomArgs = [
  {
    id: "system",
    label: "zapscript.args.system",
    kind: "system",
    required: true,
    example: "snes",
    raw: true,
  },
] as const satisfies readonly ZapArgSpec[];

const commandLineArgs = [
  {
    id: "command",
    label: "zapscript.args.command",
    kind: "text",
    required: true,
    raw: true,
  },
] as const satisfies readonly ZapArgSpec[];

const urlArgs = [
  {
    id: "url",
    label: "zapscript.args.url",
    kind: "url",
    required: true,
    example: "https://example.com/hook",
    raw: true,
  },
] as const satisfies readonly ZapArgSpec[];

const coinArgs = [
  {
    id: "amount",
    label: "zapscript.args.coins",
    kind: "number",
    example: "1",
  },
] as const satisfies readonly ZapArgSpec[];

const iniArgs = [
  {
    id: "number",
    label: "zapscript.args.iniNumber",
    kind: "number",
    required: true,
    example: "1",
  },
] as const satisfies readonly ZapArgSpec[];

// The numeric key codes of the original MiSTer NFC script, not the key names
// `input.keyboard` takes.
const legacyKeyArgs = [
  {
    id: "code",
    label: "zapscript.args.keyCode",
    kind: "number",
    required: true,
    example: "28",
  },
] as const satisfies readonly ZapArgSpec[];

// Core has no handler for these; they are in the library's command list only,
// so nothing is assumed about their arguments.
const unknownArgs = [
  { id: "text", label: "zapscript.args.text", kind: "text", raw: true },
] as const satisfies readonly ZapArgSpec[];

const playlistArg = (required: boolean): readonly ZapArgSpec[] => [
  {
    id: "playlist",
    label: "zapscript.args.playlist",
    kind: "path",
    ...(required ? { required: true } : {}),
    example: "playlists/favourites.pls",
    raw: true,
  },
];

export const ZAP_COMMANDS: readonly ZapCommandSpec[] = [
  {
    name: "launch",
    group: "launch",
    description: description("launch"),
    args: [
      {
        id: "path",
        label: "zapscript.args.media",
        kind: "media",
        required: true,
        raw: true,
      },
    ],
    advArgs: [
      adv.launcher,
      adv.system,
      adv.action,
      adv.name,
      adv.preNotice,
      adv.slot,
      adv.setName,
      adv.setNameSameDir,
      adv.when,
    ],
  },
  {
    name: "launch.system",
    group: "launch",
    description: description("launch.system"),
    args: systemArgs,
    advArgs: [adv.launcher, adv.when],
  },
  {
    name: "launch.random",
    group: "launch",
    description: description("launch.random"),
    args: randomArgs,
    advArgs: searchAdvArgs,
  },
  {
    name: "launch.search",
    group: "launch",
    description: description("launch.search"),
    args: [
      {
        id: "query",
        label: "zapscript.args.search",
        kind: "text",
        required: true,
        example: "snes/*mario*",
        raw: true,
      },
    ],
    advArgs: searchAdvArgs,
  },
  {
    name: "launch.title",
    group: "launch",
    description: description("launch.title"),
    args: [
      {
        id: "title",
        label: "zapscript.args.title",
        kind: "media",
        required: true,
        example: "snes/Super Mario World",
        raw: true,
      },
    ],
    advArgs: searchAdvArgs,
  },
  {
    name: "launch.last",
    group: "launch",
    description: description("launch.last"),
    args: [
      {
        id: "offset",
        label: "zapscript.args.historyOffset",
        kind: "number",
        example: "1",
      },
    ],
    advArgs: [
      adv.launcher,
      adv.action,
      adv.slot,
      adv.setName,
      adv.setNameSameDir,
      adv.when,
    ],
  },

  {
    name: "playlist.play",
    group: "playlist",
    description: description("playlist.play"),
    args: playlistArg(false),
    advArgs: playlistAdvArgs,
  },
  {
    name: "playlist.stop",
    group: "playlist",
    description: description("playlist.stop"),
    args: [],
    advArgs: slotAdvArgs,
  },
  {
    name: "playlist.next",
    group: "playlist",
    description: description("playlist.next"),
    args: [],
    advArgs: slotAdvArgs,
  },
  {
    name: "playlist.previous",
    group: "playlist",
    description: description("playlist.previous"),
    args: [],
    advArgs: slotAdvArgs,
  },
  {
    name: "playlist.goto",
    group: "playlist",
    description: description("playlist.goto"),
    args: [
      {
        id: "position",
        label: "zapscript.args.position",
        kind: "number",
        required: true,
        example: "1",
      },
    ],
    advArgs: slotAdvArgs,
  },
  {
    name: "playlist.pause",
    group: "playlist",
    description: description("playlist.pause"),
    args: [],
    advArgs: slotAdvArgs,
  },
  {
    name: "playlist.load",
    group: "playlist",
    description: description("playlist.load"),
    args: playlistArg(true),
    advArgs: playlistAdvArgs,
  },
  {
    name: "playlist.open",
    group: "playlist",
    description: description("playlist.open"),
    args: playlistArg(false),
    advArgs: playlistAdvArgs,
  },

  {
    name: "execute",
    group: "utility",
    description: description("execute"),
    args: commandLineArgs,
    advArgs: whenOnly,
  },
  {
    name: "delay",
    group: "utility",
    description: description("delay"),
    // Milliseconds, a duration such as `2s`, or `media_ready`.
    args: [
      {
        id: "duration",
        label: "zapscript.args.duration",
        kind: "text",
        required: true,
        example: "1000",
      },
    ],
    advArgs: whenOnly,
  },
  {
    name: "evaluate",
    group: "utility",
    description: description("evaluate"),
    args: unknownArgs,
    notOffered: true,
  },
  {
    name: "write",
    group: "utility",
    description: description("write"),
    // Core refuses a write that carries advanced arguments.
    args: [
      {
        id: "payload",
        label: "zapscript.args.text",
        kind: "text",
        required: true,
        raw: true,
      },
    ],
  },
  {
    name: "stop",
    group: "utility",
    description: description("stop"),
    args: [],
    advArgs: slotAdvArgs,
  },
  {
    name: "echo",
    group: "utility",
    description: description("echo"),
    args: [
      { id: "text", label: "zapscript.args.text", kind: "text", raw: true },
    ],
    advArgs: whenOnly,
  },
  {
    name: "control",
    group: "utility",
    description: description("control"),
    // Not a `choice`: the launcher of the playing media decides which actions
    // exist, and custom launchers define their own.
    args: [
      {
        id: "action",
        label: "zapscript.args.controlAction",
        kind: "text",
        required: true,
        example: "toggle_pause",
      },
    ],
    advArgs: whenOnly,
  },
  {
    name: "screenshot",
    group: "utility",
    description: description("screenshot"),
    args: [],
    advArgs: whenOnly,
  },

  {
    name: "mister.ini",
    group: "mister",
    description: description("mister.ini"),
    args: iniArgs,
    advArgs: whenOnly,
    platform: "mister",
  },
  {
    name: "mister.core",
    group: "mister",
    description: description("mister.core"),
    args: [
      {
        id: "path",
        label: "zapscript.args.corePath",
        kind: "path",
        required: true,
        example: "_Console/SNES",
        raw: true,
      },
    ],
    advArgs: whenOnly,
    platform: "mister",
  },
  {
    name: "mister.script",
    group: "mister",
    description: description("mister.script"),
    args: [
      {
        id: "script",
        label: "zapscript.args.script",
        kind: "text",
        required: true,
        example: "update_all.sh",
        raw: true,
      },
    ],
    advArgs: [adv.hidden, adv.when],
    platform: "mister",
  },
  {
    name: "mister.mgl",
    group: "mister",
    description: description("mister.mgl"),
    args: [
      {
        id: "content",
        label: "zapscript.args.mgl",
        kind: "text",
        required: true,
        raw: true,
      },
    ],
    advArgs: whenOnly,
    platform: "mister",
  },
  {
    name: "mister.wallpaper",
    group: "mister",
    description: description("mister.wallpaper"),
    args: [
      {
        id: "file",
        label: "zapscript.args.wallpaper",
        kind: "text",
        example: "wallpaper.png",
        raw: true,
      },
    ],
    advArgs: whenOnly,
    platform: "mister",
  },

  {
    name: "http.get",
    group: "http",
    description: description("http.get"),
    args: urlArgs,
    advArgs: whenOnly,
  },
  {
    name: "http.post",
    group: "http",
    description: description("http.post"),
    args: [
      {
        id: "url",
        label: "zapscript.args.url",
        kind: "url",
        required: true,
        example: "https://example.com/hook",
      },
      {
        id: "contentType",
        label: "zapscript.args.contentType",
        kind: "text",
        required: true,
        example: "application/json",
      },
      {
        id: "body",
        label: "zapscript.args.body",
        kind: "text",
        required: true,
        raw: true,
      },
    ],
    advArgs: whenOnly,
  },

  {
    name: "input.keyboard",
    group: "input",
    description: description("input.keyboard"),
    args: [
      {
        id: "keys",
        label: "zapscript.args.keys",
        kind: "keys",
        required: true,
        example: "{f2}",
        raw: true,
      },
    ],
    advArgs: macroAdvArgs,
  },
  {
    name: "input.gamepad",
    group: "input",
    description: description("input.gamepad"),
    args: [
      {
        id: "buttons",
        label: "zapscript.args.buttons",
        kind: "keys",
        required: true,
        example: "{start}",
        raw: true,
      },
    ],
    advArgs: macroAdvArgs,
  },
  {
    name: "input.text",
    group: "input",
    description: description("input.text"),
    // Everything after the colon is typed, so there is no room for advanced
    // arguments.
    args: [
      {
        id: "text",
        label: "zapscript.args.text",
        kind: "text",
        required: true,
        raw: true,
      },
    ],
  },
  {
    name: "input.coinp1",
    group: "input",
    description: description("input.coinp1"),
    args: coinArgs,
    advArgs: whenOnly,
  },
  {
    name: "input.coinp2",
    group: "input",
    description: description("input.coinp2"),
    args: coinArgs,
    advArgs: whenOnly,
  },
  {
    name: "input.coinp3",
    group: "input",
    description: description("input.coinp3"),
    args: coinArgs,
    advArgs: whenOnly,
  },
  {
    name: "input.coinp4",
    group: "input",
    description: description("input.coinp4"),
    args: coinArgs,
    advArgs: whenOnly,
  },

  {
    name: "ui.notice",
    group: "ui",
    description: description("ui.notice"),
    args: unknownArgs,
    notOffered: true,
  },
  {
    name: "ui.picker",
    group: "ui",
    description: description("ui.picker"),
    args: unknownArgs,
    notOffered: true,
  },

  {
    name: "traits",
    group: "utility",
    description: description("traits"),
    args: unknownArgs,
    notOffered: true,
  },

  {
    name: "profile",
    group: "profile",
    description: description("profile"),
    args: [
      {
        id: "switchId",
        label: "zapscript.args.profileId",
        kind: "text",
        required: true,
      },
    ],
    advArgs: whenOnly,
  },
  {
    name: "profile.clear",
    group: "profile",
    description: description("profile.clear"),
    args: [],
    advArgs: whenOnly,
  },
  {
    name: "playtime.extend",
    group: "profile",
    description: description("playtime.extend"),
    // A duration such as `15m`, or `today`.
    args: [
      {
        id: "amount",
        label: "zapscript.args.extraTime",
        kind: "text",
        required: true,
        example: "15m",
      },
    ],
    advArgs: [adv.profile, adv.when],
  },

  {
    name: "input.key",
    group: "input",
    description: description("input.keyboard"),
    args: legacyKeyArgs,
    advArgs: whenOnly,
    replacedBy: "input.keyboard",
  },
  {
    name: "key",
    group: "input",
    description: description("input.keyboard"),
    args: legacyKeyArgs,
    advArgs: whenOnly,
    replacedBy: "input.keyboard",
  },
  {
    name: "coinp1",
    group: "input",
    description: description("input.coinp1"),
    args: coinArgs,
    advArgs: whenOnly,
    replacedBy: "input.coinp1",
  },
  {
    name: "coinp2",
    group: "input",
    description: description("input.coinp2"),
    args: coinArgs,
    advArgs: whenOnly,
    replacedBy: "input.coinp2",
  },
  {
    name: "random",
    group: "launch",
    description: description("launch.random"),
    args: randomArgs,
    advArgs: searchAdvArgs,
    replacedBy: "launch.random",
  },
  {
    name: "shell",
    group: "utility",
    description: description("execute"),
    args: commandLineArgs,
    advArgs: whenOnly,
    replacedBy: "execute",
  },
  {
    name: "command",
    group: "utility",
    description: description("execute"),
    args: commandLineArgs,
    advArgs: whenOnly,
    replacedBy: "execute",
  },
  {
    name: "ini",
    group: "mister",
    description: description("mister.ini"),
    args: iniArgs,
    advArgs: whenOnly,
    platform: "mister",
    replacedBy: "mister.ini",
  },
  {
    name: "system",
    group: "launch",
    description: description("launch.system"),
    args: systemArgs,
    advArgs: [adv.launcher, adv.when],
    replacedBy: "launch.system",
  },
  {
    name: "get",
    group: "http",
    description: description("http.get"),
    args: urlArgs,
    advArgs: whenOnly,
    replacedBy: "http.get",
  },
];

const commandsByName = new Map(
  ZAP_COMMANDS.map((command) => [command.name, command]),
);

export function zapCommand(name: string): ZapCommandSpec | undefined {
  return commandsByName.get(name.trim().toLowerCase());
}
