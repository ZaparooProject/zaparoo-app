import { faker } from "@faker-js/faker";
import {
  VersionResponse,
  LaunchRequest,
  WriteRequest,
  System,
  MappingResponse,
  TokenResponse,
  IndexResponse,
  PlayingResponse,
  MediaResponse,
  MappingType,
  ReaderInfo,
  ReadersResponse,
} from "../lib/models";

export const mockSystem = (overrides?: Partial<System>): System => ({
  id: faker.string.uuid(),
  name: faker.word.words(2),
  category: faker.helpers.arrayElement(["console", "computer", "handheld"]),
  ...overrides,
});

export const mockVersionResponse = (
  overrides?: Partial<VersionResponse>,
): VersionResponse => ({
  version: faker.system.semver(),
  platform: faker.helpers.arrayElement(["linux", "windows", "macos"]),
  ...overrides,
});

export const mockLaunchRequest = (
  overrides?: Partial<LaunchRequest>,
): LaunchRequest => ({
  uid: faker.string.uuid(),
  text: faker.lorem.words(3),
  data: faker.string.alphanumeric(8),
  unsafe: faker.datatype.boolean(),
  ...overrides,
});

export const mockWriteRequest = (
  overrides?: Partial<WriteRequest>,
): WriteRequest => ({
  text: faker.lorem.words(5),
  ...overrides,
});

export const mockTokenResponse = (
  overrides?: Partial<TokenResponse>,
): TokenResponse => ({
  type: faker.helpers.arrayElement(["ntag213", "ntag215", "ntag216"]),
  uid: faker.string.hexadecimal({ length: 14 }).slice(2),
  text: faker.lorem.words(3),
  data: faker.string.alphanumeric(8),
  scanTime: faker.date.recent().toISOString(),
  ...overrides,
});

export const mockPlayingResponse = (
  overrides?: Partial<PlayingResponse>,
): PlayingResponse => ({
  systemId: faker.string.uuid(),
  systemName: faker.word.words(2),
  mediaName: faker.word.words(3),
  mediaPath: faker.system.filePath(),
  ...overrides,
});

export const mockIndexResponse = (
  overrides?: Partial<IndexResponse>,
): IndexResponse => ({
  exists: faker.datatype.boolean(),
  indexing: faker.datatype.boolean(),
  totalSteps: faker.number.int({ min: 1, max: 100 }),
  currentStep: faker.number.int({ min: 1, max: 50 }),
  currentStepDisplay: faker.lorem.words(2),
  totalFiles: faker.number.int({ min: 10, max: 1000 }),
  ...overrides,
});

export const mockMediaResponse = (
  overrides?: Partial<MediaResponse>,
): MediaResponse => ({
  database: mockIndexResponse(),
  active: faker.helpers.multiple(() => mockPlayingResponse(), {
    count: { min: 0, max: 3 },
  }),
  ...overrides,
});

export const mockMappingResponse = (
  overrides?: Partial<MappingResponse>,
): MappingResponse => ({
  id: faker.string.uuid(),
  added: faker.date.recent().toISOString(),
  label: faker.word.words(2),
  enabled: faker.datatype.boolean(),
  type: faker.helpers.arrayElement<MappingType>(["uid", "text", "data"]),
  match: faker.lorem.words(2),
  pattern: faker.lorem.words(2),
  override: faker.lorem.words(2),
  ...overrides,
});

export const mockReaderInfo = (
  overrides?: Partial<ReaderInfo>,
): ReaderInfo => ({
  id: faker.helpers.arrayElement(["pn532_1", "acr122u_1", "simple_serial_1"]),
  info: faker.helpers.arrayElement([
    "PN532 NFC Reader",
    "ACR122U USB Reader",
    "Simple Serial Reader",
  ]),
  capabilities: faker.helpers.arrayElements(["read", "write"], {
    min: 1,
    max: 2,
  }),
  connected: faker.datatype.boolean(),
  ...overrides,
});

export const mockReadersResponse = (
  overrides?: Partial<ReadersResponse>,
): ReadersResponse => ({
  readers: faker.helpers.multiple(() => mockReaderInfo(), {
    count: { min: 0, max: 3 },
  }),
  ...overrides,
});
