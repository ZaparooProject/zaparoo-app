import { faker } from "@faker-js/faker";
import { InboxMessage, InboxSeverity, ReaderInfo } from "../lib/models";
import type {
  RuntimeReleaseIdentity,
  WhatsNewAnnouncement,
} from "../lib/whatsNew";

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

export const mockInboxMessage = (
  overrides?: Partial<InboxMessage>,
): InboxMessage => ({
  id: faker.number.int({ min: 1, max: 1_000_000 }),
  title: faker.lorem.sentence(),
  body: faker.lorem.paragraph(),
  severity: faker.helpers.arrayElement([
    InboxSeverity.Info,
    InboxSeverity.Warning,
    InboxSeverity.Error,
  ]),
  createdAt: faker.date.recent().toISOString(),
  ...overrides,
});

export const buildRuntimeReleaseIdentity = (
  overrides?: Partial<RuntimeReleaseIdentity>,
): RuntimeReleaseIdentity => ({
  nativeVersion: "1.0.1",
  nativeBuild: "2",
  liveBundleId: null,
  releaseKey: "native:1.0.1+2",
  ...overrides,
});

export const buildWhatsNewAnnouncement = (
  overrides?: Partial<WhatsNewAnnouncement>,
): WhatsNewAnnouncement => ({
  id: "release-1.0.1",
  releaseKeys: ["native:1.0.1+2"],
  title: "What's new in test",
  items: ["First test item", "Second test item"],
  ...overrides,
});
