import { describe, expect, it } from "vitest";
import {
  parseDeviceEndpointsResult,
  webSocketUrlsFromEndpoints,
} from "@/lib/transport/deviceEndpoints";

describe("parseDeviceEndpointsResult", () => {
  it("reads Core's answer", () => {
    expect(
      parseDeviceEndpointsResult({
        deviceId: " core-1 ",
        scheme: "ws",
        addresses: ["10.0.0.5", "FE80::1", "10.0.0.5"],
        port: 7497,
        ble: true,
      }),
    ).toEqual({
      deviceId: "core-1",
      scheme: "ws",
      addresses: ["10.0.0.5", "fe80::1"],
      port: 7497,
      ble: true,
    });
  });

  it("drops addresses that are not hosts and caps the list", () => {
    const many = Array.from({ length: 20 }, (_, i) => `10.0.0.${i + 1}`);
    const result = parseDeviceEndpointsResult({
      deviceId: "core-1",
      addresses: ["", "not a host!", 5, ...many],
      port: 7497,
    });
    expect(result?.addresses).toHaveLength(16);
    expect(result?.addresses[0]).toBe("10.0.0.1");
    expect(result?.ble).toBe(false);
    expect(result?.scheme).toBe("ws");
  });

  it("reads the name Core goes by", () => {
    expect(
      parseDeviceEndpointsResult({
        deviceId: "core-1",
        name: " MiSTer\u0007 ",
        port: 7497,
      })?.name,
    ).toBe("MiSTer");
    expect(
      parseDeviceEndpointsResult({
        deviceId: "core-1",
        name: "x".repeat(100),
        port: 7497,
      })?.name,
    ).toHaveLength(64);
  });

  it.each([
    ["missing", undefined],
    ["blank", "  "],
    ["not a string", 5],
  ])("leaves out a name that is %s", (_name, name) => {
    expect(
      parseDeviceEndpointsResult({ deviceId: "core-1", name, port: 7497 }),
    ).not.toHaveProperty("name");
  });

  it("treats missing addresses as none", () => {
    expect(
      parseDeviceEndpointsResult({ deviceId: "core-1", port: 7497 })?.addresses,
    ).toEqual([]);
  });

  it.each([
    ["null", null],
    ["a string", "x"],
    ["no device id", { port: 7497 }],
    ["an empty device id", { deviceId: "", port: 7497 }],
    ["no port", { deviceId: "core-1" }],
    ["a port out of range", { deviceId: "core-1", port: 70000 }],
    ["a fractional port", { deviceId: "core-1", port: 74.5 }],
  ])("refuses %s", (_name, value) => {
    expect(parseDeviceEndpointsResult(value)).toBeNull();
  });
});

describe("webSocketUrlsFromEndpoints", () => {
  it("builds a URL per address", () => {
    expect(
      webSocketUrlsFromEndpoints({
        deviceId: "core-1",
        scheme: "ws",
        addresses: ["10.0.0.5", "192.168.1.5"],
        port: 7497,
        ble: true,
      }),
    ).toEqual([
      "ws://10.0.0.5:7497/api/v0.1",
      "ws://192.168.1.5:7497/api/v0.1",
    ]);
  });
});
