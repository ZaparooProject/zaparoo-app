import { vi } from "vitest";

export const ZeroConf = {
  getHostname: vi.fn().mockResolvedValue({ hostname: "test-device" }),
  register: vi.fn().mockResolvedValue(undefined),
  unregister: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  watch: vi.fn().mockResolvedValue("watch-id"),
  unwatch: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
};

// Re-export types that tests might need
export type ZeroConfService = {
  domain: string;
  type: string;
  name: string;
  port: number;
  hostname: string;
  ipv4Addresses: string[];
  ipv6Addresses: string[];
  txtRecord: Record<string, string>;
};

export type ZeroConfWatchResult = {
  action: "added" | "removed" | "resolved";
  service: ZeroConfService;
};
