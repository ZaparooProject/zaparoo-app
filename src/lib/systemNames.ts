import type { System } from "@/lib/models";

// Adapted from ThreepwoodLeBrush/Names_MiSTer (CC0 1.0), re-keyed to
// Zaparoo Core canonical system IDs and curated by Zaparoo Frontend.
export type SystemNameRegionPreference = "auto" | "us" | "eu" | "jp";
export type SystemNameRegion = Exclude<SystemNameRegionPreference, "auto">;

const US_SYSTEM_NAMES: Record<string, string> = {
  "3DO": "3DO",
  AdventureVision: "Adventure Vision",
  Arcadia: "Arcadia 2001",
  Astrocade: "Bally Astrocade",
  Atari2600: "Atari 2600",
  Atari5200: "Atari 5200",
  Atari7800: "Atari 7800",
  AtariXEGS: "Atari XEGS",
  CasioPV1000: "Casio PV-1000",
  ChannelF: "Channel F",
  ColecoVision: "ColecoVision",
  CreatiVision: "CreatiVision",
  Dreamcast: "Dreamcast",
  FDS: "Famicom Disk System",
  GameCube: "GameCube",
  Genesis: "Genesis",
  Intellivision: "Intellivision",
  Jaguar: "Atari Jaguar",
  JaguarCD: "Atari Jaguar CD",
  MasterSystem: "Master System",
  MegaCD: "Sega CD",
  NES: "NES",
  Nintendo64: "Nintendo 64",
  Odyssey2: "Odyssey 2",
  PCFX: "PC-FX",
  PS2: "PlayStation 2",
  PS3: "PlayStation 3",
  PSX: "PlayStation",
  Saturn: "Saturn",
  Sega32X: "Genesis 32X",
  SG1000: "SG-1000",
  SNES: "SNES",
  SuperGrafx: "SuperGrafx",
  Switch: "Switch",
  TurboGrafx16: "TurboGrafx-16",
  TurboGrafx16CD: "TurboGrafx-CD",
  VC4000: "Interton VC 4000",
  Vectrex: "Vectrex",
  VirtualBoy: "Virtual Boy",
  Wii: "Wii",
  WiiU: "Wii U",
  Xbox: "Xbox",
  "3DS": "Nintendo 3DS",
  AtariLynx: "Atari Lynx",
  Gamate: "Gamate",
  Gameboy: "Game Boy",
  Gameboy2P: "Game Boy (2P)",
  GameboyColor: "Game Boy Color",
  GameCom: "Game.com",
  GameGear: "Game Gear",
  GameNWatch: "Game & Watch",
  GBA: "Game Boy Advance",
  GBA2P: "Game Boy Advance (2P)",
  MegaDuck: "Mega Duck",
  NDS: "Nintendo DS",
  NeoGeoPocket: "Neo Geo Pocket",
  NeoGeoPocketColor: "Neo Geo Pocket Color",
  PocketChallengeV2: "Pocket Challenge V2",
  PokemonMini: "Pokémon Mini",
  PSP: "PSP",
  SuperGameboy: "Super Game Boy",
  SuperVision: "SuperVision",
  Vita: "PS Vita",
  WonderSwan: "WonderSwan",
  WonderSwanColor: "WonderSwan Color",
  AcornAtom: "Acorn Atom",
  AcornElectron: "Acorn Electron",
  AliceMC10: "Tandy MC-10",
  Amiga: "Amiga",
  Amstrad: "Amstrad CPC",
  AmstradPCW: "Amstrad PCW",
  Apogee: "Apogee BK-01",
  AppleI: "Apple I",
  AppleII: "Apple II",
  Aquarius: "Mattel Aquarius",
  Archimedes: "Acorn Archimedes",
  Atari800: "Atari 800",
  AtariST: "Atari ST",
  BBCMicro: "BBC Micro",
  BK0011M: "BK-0011M",
  C16: "Commodore 16",
  C64: "Commodore 64",
  CasioPV2000: "Casio PV-2000",
  CDI: "CD-i",
  CoCo2: "Tandy Color Computer 2",
  ColecoAdam: "Coleco Adam",
  DOS: "MS-DOS",
  EDSAC: "EDSAC",
  Galaksija: "Galaksija",
  Interact: "Interact",
  Jupiter: "Jupiter Ace",
  Laser: "Laser 310",
  Lynx48: "Camputers Lynx",
  MacPlus: "Macintosh Plus",
  MSX: "MSX",
  MSX1: "MSX1",
  MultiComp: "MultiComp",
  Orao: "Orao",
  Oric: "Oric",
  PC88: "PC-8801",
  PC98: "PC-9801",
  PCXT: "IBM PC XT",
  PDP1: "PDP-1",
  PET2001: "Commodore PET",
  PMD85: "PMD 85",
  QL: "Sinclair QL",
  RX78: "Bandai RX-78",
  SAMCoupe: "SAM Coupé",
  SordM5: "Sord M5",
  Specialist: "Specialist MX",
  Spectravideo: "Spectravideo",
  SVI328: "SVI-328",
  TatungEinstein: "Tatung Einstein",
  TI994A: "TI-99/4A",
  TomyTutor: "Tomy Tutor",
  TRS80: "TRS-80",
  TSConf: "TS-Config",
  UK101: "UK101",
  Vector06C: "Vector-06C",
  VIC20: "Commodore VIC-20",
  X68000: "X68000",
  ZX81: "ZX81",
  ZXNext: "ZX Spectrum Next",
  ZXSpectrum: "ZX Spectrum",
  Arcade: "Arcade",
  NeoGeo: "Neo Geo",
  NeoGeoCD: "Neo Geo CD",
  Arduboy: "Arduboy",
  Chip8: "CHIP-8",
};

const EU_NAME_OVERRIDES: Record<string, string> = {
  Genesis: "Mega Drive",
  MegaCD: "Mega-CD",
  Odyssey2: "Videopac",
  Sega32X: "Mega Drive 32X",
  TurboGrafx16: "PC Engine",
  TurboGrafx16CD: "PC Engine CD",
  AliceMC10: "Matra Alice",
};

const JP_NAME_OVERRIDES: Record<string, string> = {
  Genesis: "Mega Drive",
  MasterSystem: "Mark III",
  MegaCD: "Mega-CD",
  NES: "Famicom",
  Sega32X: "Super 32X",
  SNES: "Super Famicom",
  TurboGrafx16: "PC Engine",
  TurboGrafx16CD: "PC Engine CD",
  TomyTutor: "Pyuta",
};

const EU_STYLE_TERRITORIES = new Set([
  "AD",
  "AL",
  "AT",
  "AU",
  "BA",
  "BE",
  "BG",
  "BY",
  "CH",
  "CY",
  "CZ",
  "DE",
  "DK",
  "EE",
  "ES",
  "FI",
  "FR",
  "GB",
  "GR",
  "HR",
  "HU",
  "IE",
  "IS",
  "IT",
  "LI",
  "LT",
  "LU",
  "LV",
  "MC",
  "MD",
  "ME",
  "MK",
  "MT",
  "NL",
  "NO",
  "NZ",
  "PL",
  "PT",
  "RO",
  "RS",
  "RU",
  "SE",
  "SI",
  "SK",
  "SM",
  "UA",
  "VA",
  "ZA",
]);

function localeParts(locale: string): { language: string; region: string } {
  try {
    const maximized = new Intl.Locale(locale).maximize();
    return {
      language: maximized.language.toLowerCase(),
      region: maximized.region?.toUpperCase() ?? "",
    };
  } catch {
    const [language = "", region = ""] = locale.split(/[-_]/);
    return {
      language: language.toLowerCase(),
      region: region.toUpperCase(),
    };
  }
}

export function resolveSystemNameRegion(
  preference: SystemNameRegionPreference,
  locale: string,
): SystemNameRegion {
  if (preference !== "auto") return preference;

  const { language, region } = localeParts(locale);
  if (language === "ja" || region === "JP") return "jp";
  if (EU_STYLE_TERRITORIES.has(region)) return "eu";
  if (region === "US" || region === "CA" || region === "MX") return "us";
  return language === "en" ? "us" : "eu";
}

export function systemDisplayName(
  systemId: string,
  coreName: string,
  preference: SystemNameRegionPreference,
  locale: string,
): string {
  const baseName = US_SYSTEM_NAMES[systemId];
  if (!baseName) return coreName || systemId;

  const region = resolveSystemNameRegion(preference, locale);
  if (region === "eu") return EU_NAME_OVERRIDES[systemId] ?? baseName;
  if (region === "jp") return JP_NAME_OVERRIDES[systemId] ?? baseName;
  return baseName;
}

export function systemWithDisplayName(
  system: System,
  preference: SystemNameRegionPreference,
  locale: string,
): System {
  return {
    ...system,
    name: systemDisplayName(system.id, system.name, preference, locale),
  };
}
