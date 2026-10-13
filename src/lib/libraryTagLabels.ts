import type { TagInfo } from "@/lib/models";

const REGION_KEYS: Record<string, string> = {
  world: "world",
  ww: "world",
  us: "us",
  usa: "us",
  eu: "eu",
  europe: "eu",
  jp: "jp",
  japan: "jp",
  au: "au",
  kr: "kr",
  cn: "cn",
  tw: "tw",
  hk: "hk",
  br: "br",
  ca: "ca",
  uk: "uk",
  gb: "uk",
  fr: "fr",
  de: "de",
  it: "it",
  es: "es",
  scandinavia: "scandinavia",
  asia: "asia",
};
const LANGUAGE_KEYS: Record<string, string> = {
  en: "en",
  eng: "en",
  fr: "fr",
  fre: "fr",
  fra: "fr",
  de: "de",
  ger: "de",
  deu: "de",
  es: "es",
  spa: "es",
  it: "it",
  ita: "it",
  ja: "ja",
  jpn: "ja",
  ko: "ko",
  kor: "ko",
  zh: "zh",
  chi: "zh",
  zho: "zh",
  pt: "pt",
  por: "pt",
  nl: "nl",
  dut: "nl",
  nld: "nl",
  sv: "sv",
  no: "no",
  da: "da",
  fi: "fi",
  pl: "pl",
  pol: "pl",
  ru: "ru",
  rus: "ru",
  ar: "ar",
  ara: "ar",
  "en-us": "en-US",
  "en-gb": "en-GB",
};
const EDITION_KEYS: Record<string, string> = {
  "directors-cut": "directorsCut",
  collectors: "collectors",
  limited: "limited",
  special: "special",
  deluxe: "deluxe",
  ultimate: "ultimate",
  anniversary: "anniversary",
  remaster: "remastered",
  remastered: "remastered",
  remake: "remake",
  remix: "remix",
  complete: "complete",
  goty: "goty",
};

const words = (list: string) => new Set(list.split(" "));

/**
 * Core sends a label only for free-text values. Canonical vocabulary values
 * (zaparoo-core pkg/database/tags/tag_values.go) arrive unlabeled, so the
 * closed vocabularies shown on ordinary game details are named here. Entries
 * are translation keys under `library.tagValues.<vocabulary>`: the Core value
 * with ":" replaced by "_".
 */
const VOCABULARIES: Record<string, Set<string>> = {
  genre: words(
    "action action_platformer action_maze action_blockbreaker " +
      "action_runandgun action_hackandslash action_metroidvania " +
      "action_roguelite adventure adventure_pointandclick " +
      "adventure_visualnovel adventure_survivalhorror adventure_text board " +
      "board_cards board_hanafuda board_chess board_shougi board_go " +
      "board_mahjong board_reversi board_othello board_backgammon board_party " +
      "board_jankenpon brawler fighting fighting_melee minigames parlor " +
      "parlor_pinball parlor_jackpot parlor_pachinko parlor_darts " +
      "parlor_bowling parlor_billiards parlor_mogurataiji parlor_kiddieride " +
      "parlor_mechanical quiz racing racing_combat racing_driving rpg rpg_a " +
      "rpg_j rpg_s rpg_dungeoncrawler rpg_mmo rhythm rhythm_karaoke " +
      "rhythm_dance shmup shmup_h shmup_v shmup_i shmup_danmaku shooting " +
      "shooting_gallery shooting_rail shooting_fps shooting_tps puzzle " +
      "puzzle_drop puzzle_mind sim sim_strategy sim_cardgame sim_flight " +
      "sim_train sim_date sim_otome sim_life sim_farm sim_pet sim_fishing " +
      "sim_god sim_derby sim_building sim_cooking sports sports_soccer " +
      "sports_basketball sports_baseball sports_volleyball sports_rugby " +
      "sports_football sports_dodgeball sports_hockey sports_skiing " +
      "sports_skateboarding sports_snowboarding sports_tennis sports_pingpong " +
      "sports_paddle sports_squash sports_badminton sports_flyingdisc " +
      "sports_cycling sports_formula1 sports_rally sports_nascar " +
      "sports_motogp sports_motocross sports_karting sports_jetski " +
      "sports_golf sports_cricket sports_boxing sports_kickboxing " +
      "sports_wrestling sports_sumo sports_karate sports_judo sports_kendo " +
      "sports_taekwondo sports_mma sports_decathlon sports_running " +
      "sports_archery sports_swimming sports_rowing sports_kayak sports_surf " +
      "notagame notagame_educational notagame_drawing notagame_popcorn " +
      "notagame_purikura notagame_redemption notagame_media notagame_magazine " +
      "notagame_application notagame_test notagame_sdk notagame_slideshow " +
      "notagame_sound sim_management sports_roller",
  ),
  players: words("vs coop alt simultaneous mmo"),
  input: words(
    "joystick joystick_2h joystick_2v joystick_double joystick_rotary stick " +
      "stick_twin trackball paddle spinner wheel dial lightgun optical " +
      "positional buttons buttons_pneumatic pedals puncher motion keyboard " +
      "keyboard_mahjong touchscreen touchscreen_resistive " +
      "touchscreen_capacitive accelerometer ddrpad hrm",
  ),
  save: words("backup password"),
  media: words("disc disk file part side tape cart"),
  unfinished: words(
    "alpha beta proto demo demo_auto demo_kiosk demo_playable demo_rolling " +
      "demo_slideshow sample debug competition preview prerelease final wip",
  ),
  unlicensed: words(
    "unlicensed bootleg hack clone pirate translation translation_old " +
      "aftermarket",
  ),
  release: words(
    "homebrew unreleased public-domain reissue classics promo " +
      "not-for-resale kiosk",
  ),
  dump: words(
    "cracked fixed hacked modified pirated trained translated overdump " +
      "underdump virus bad alternate verified pending checksum-bad " +
      "checksum-unknown hacked_intro hacked_intro-removed no-boot",
  ),
  copyright: words("cw cw-r fw gw gw-r lw pd sw sw-r"),
  perspective: words(
    "firstperson thirdperson topdown isometric fixedcamera " +
      "sidescroll_horizontal sidescroll_vertical",
  ),
  art: words("pixelart celshaded vector digitized handdrawn"),
  accessibility: words(
    "visual_colorblindmode visual_highcontrast visual_textsizeadjust " +
      "audio_subtitles audio_monoaudio audio_visualcues " +
      "input_remappablecontrols input_onebuttonmode",
  ),
  cabinet: words("upright cocktail cabaret sitdown"),
  protection: words("no-protection encrypted decrypted"),
  supplement: words("update expansion theme avatar"),
  based: words("manganime movie"),
  multigame: words("compilation menu"),
  alt: words("alt"),
};

/** Tag types that share another type's vocabulary. */
const VOCABULARY_ALIASES: Record<string, string> = { gamegenre: "genre" };

/** Numbered members of a vocabulary, shown through a counting template. */
const COUNT_TEMPLATES: Record<string, Record<string, string>> = {
  input: {
    joystick: "joystickWays",
    buttons: "buttonsCount",
    pedals: "pedalsCount",
    positional: "positionalCount",
    puncher: "puncherCount",
  },
  multigame: { vol: "volume" },
};

/** Codes and proper names that read the same in every language. */
const FIXED_LABELS: Record<string, Record<string, string>> = {
  video: {
    ntsc: "NTSC",
    pal: "PAL",
    "pal-60": "PAL 60",
    "ntsc-pal": "NTSC/PAL",
    "pal-ntsc": "PAL/NTSC",
    cga: "CGA",
    ega: "EGA",
    hgc: "HGC",
    mcga: "MCGA",
    mda: "MDA",
    svga: "SVGA",
    vga: "VGA",
    xga: "XGA",
    "15khz": "15 kHz",
    "31khz": "31 kHz",
  },
  media: {
    n64dd: "64DD",
    fds: "Famicom Disk System",
    ereader: "e-Reader",
    multiboot: "Multiboot",
    lnx: "LNX",
  },
  art: { "2d": "2D", "3d": "3D" },
  supplement: { dlc: "DLC" },
  dump: { bios: "BIOS", "hacked:ffe": "FFE" },
  protection: { fd1094: "FD1094", fd1089: "FD1089", "mc-8123": "MC-8123" },
  based: {
    disney: "Disney",
    dnd: "Dungeons & Dragons",
    jurassicpark: "Jurassic Park",
    looneytunes: "Looney Tunes",
    marvel: "Marvel",
    simpsons: "The Simpsons",
    smurfs: "The Smurfs",
    starwars: "Star Wars",
    tmnt: "Teenage Mutant Ninja Turtles",
    cartoonnetwork: "Cartoon Network",
    hannabarbera: "Hanna-Barbera",
    nickelodeon: "Nickelodeon",
  },
  distribution: {
    "virtual-console": "Virtual Console",
    wiiware: "WiiWare",
    xblig: "Xbox Live Indie Games",
    dsiware: "DSiWare",
    gamecube: "GameCube",
    "switch-online": "Nintendo Switch Online",
    "disk-writer": "Disk Writer",
    steam: "Steam",
    "sega-channel": "Sega Channel",
    "genesis-mini": "Genesis Mini",
    "sega-ages": "Sega Ages",
    "sega-smash-pack": "Sega Smash Pack",
    wii: "Wii",
    "club-nintendo": "Club Nintendo",
    "gba-e-reader": "GBA e-Reader",
  },
  patch: {
    fastrom: "FastROM",
    slowrom: "SlowROM",
    msu1: "MSU-1",
    sa1: "SA-1",
    sram: "SRAM",
    "no-sram": "No SRAM",
    qol: "QoL",
  },
};

type TranslateTagLabel = (
  key: string,
  options?: Record<string, string>,
) => string;

const has = (record: object, key: string) =>
  Object.prototype.hasOwnProperty.call(record, key);

function vocabularyLabel(
  type: string,
  value: string,
  t: TranslateTagLabel,
): string | undefined {
  const fixed = has(FIXED_LABELS, type) ? FIXED_LABELS[type] : undefined;
  if (fixed && has(fixed, value)) return fixed[value];

  const name = has(VOCABULARY_ALIASES, type) ? VOCABULARY_ALIASES[type]! : type;
  const vocabulary = has(VOCABULARIES, name) ? VOCABULARIES[name] : undefined;
  if (!vocabulary) return undefined;
  const prefix = `library.tagValues.${name}`;
  const key = value.replace(/:/g, "_");
  if (vocabulary.has(key)) return t(`${prefix}.${key}`);

  const numbered = /^([a-z]+):(\d+)$/.exec(value);
  if (numbered) {
    const family = numbered[1]!;
    const count = numbered[2]!;
    const templates = has(COUNT_TEMPLATES, name)
      ? COUNT_TEMPLATES[name]
      : undefined;
    if (templates && has(templates, family))
      return t(`${prefix}.${templates[family]}`, { value: count });
    // beta:2, proto:3 and demo:1 are numbered builds of a named stage.
    if (name === "unfinished" && vocabulary.has(family))
      return t("library.tagValueNumbered", {
        name: t(`${prefix}.${family}`),
        value: count,
      });
  }
  if (name === "media") {
    const side = /^side-([a-z])$/.exec(value);
    if (side)
      return t(`${prefix}.sideLetter`, { value: side[1]!.toUpperCase() });
  }
  return undefined;
}

function singleValueLabel(
  type: string,
  raw: string,
  t: TranslateTagLabel,
): string {
  const value = raw.toLowerCase();
  const mappings =
    type === "region"
      ? REGION_KEYS
      : type === "lang"
        ? LANGUAGE_KEYS
        : type === "edition"
          ? EDITION_KEYS
          : undefined;
  if (mappings && has(mappings, value))
    return t(`library.tagValues.${type}.${mappings[value]}`);
  if (type === "rev") {
    const revision = value.replace(
      /^(?:revision-|version-|revision|version|rev-|ver-)/,
      "",
    );
    if (/^\d+$/.test(revision))
      return t("library.revisionValue", { value: revision });
  }
  // Free text and values outside the known vocabularies are shown as sent.
  return vocabularyLabel(type, value, t) ?? raw;
}

/**
 * Display name for a tag value. A meaningful Core label wins; otherwise only
 * known vocabulary values are named. Anything else, including free text Core
 * sent without a label, is returned exactly as sent. Comma-separated lists
 * are named part by part when at least one part is known.
 */
export function libraryTagDisplayLabel(
  tag: TagInfo,
  t: TranslateTagLabel,
): string {
  const raw = tag.tag.trim();
  const label = tag.label?.trim();
  if (label && label !== raw) return label;
  const type = tag.type.trim().toLowerCase();
  if (!raw.includes(",")) return singleValueLabel(type, raw, t);
  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const labels = parts.map((part) => singleValueLabel(type, part, t));
  return labels.some((label, index) => label !== parts[index])
    ? labels.join(", ")
    : raw;
}
