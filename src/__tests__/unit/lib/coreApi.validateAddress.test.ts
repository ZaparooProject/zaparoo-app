/**
 * Unit Tests: CoreAPI device address validation
 *
 * This is the entry point for every address the user types, so it owns the
 * normalisation rules the settings form depends on. Address parsing itself is
 * covered by `devices/endpoint.test.ts`.
 */

import { describe, it, expect } from "vitest";
import { validateDeviceAddress } from "@/lib/coreApi";

describe("validateDeviceAddress", () => {
  it("should trim and normalize valid addresses", () => {
    const result = validateDeviceAddress(" 192.168.1.100:8080 ");

    expect(result).toEqual({
      ok: true,
      address: "192.168.1.100:8080",
      host: "192.168.1.100",
      port: 8080,
      wsUrl: "ws://192.168.1.100:8080/api/v0.1",
    });
  });

  it("should normalize pasted Core API URLs", () => {
    const result = validateDeviceAddress("http://mydevice.local:9000/api/v0.1");

    expect(result).toEqual({
      ok: true,
      address: "mydevice.local:9000",
      host: "mydevice.local",
      port: 9000,
      wsUrl: "ws://mydevice.local:9000/api/v0.1",
    });
  });

  it("should preserve secure URL schemes", () => {
    const result = validateDeviceAddress(
      "https://mydevice.local:9000/api/v0.1",
    );

    expect(result).toEqual({
      ok: true,
      address: "wss://mydevice.local:9000",
      host: "mydevice.local",
      port: 9000,
      wsUrl: "wss://mydevice.local:9000/api/v0.1",
    });
  });

  it("should ask for an address when the field is blank", () => {
    const result = validateDeviceAddress("   ");

    expect(result).toMatchObject({
      ok: false,
      errorKey: "settings.deviceAddressRequired",
    });
  });

  it("should reject malformed IPv6", () => {
    const result = validateDeviceAddress("2001:::1");

    expect(result).toMatchObject({
      ok: false,
      errorKey: "settings.deviceAddressInvalid",
    });
  });

  it("should reject URL paths beyond the Core API endpoint", () => {
    const result = validateDeviceAddress("http://mydevice.local/other");

    expect(result).toMatchObject({
      ok: false,
      errorKey: "settings.deviceAddressInvalid",
    });
  });
});
