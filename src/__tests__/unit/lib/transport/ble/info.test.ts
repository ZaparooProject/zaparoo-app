import { describe, expect, it } from "vitest";
import { BleInfoError, parseBleInfo } from "@/lib/transport/ble/info";
import { BLE_DEFAULT_WINDOW } from "@/lib/transport/ble/constants";

const bytes = (value: unknown) =>
  Array.from(new TextEncoder().encode(JSON.stringify(value)));

describe("parseBleInfo", () => {
  it("reads every field Core sends", () => {
    expect(
      parseBleInfo(
        bytes({
          v: 1,
          deviceId: " core-1 ",
          maxMessage: 1000,
          maxUnauthenticated: 100,
          preferredMtu: 247,
          window: 8,
        }),
      ),
    ).toEqual({
      version: 1,
      deviceId: "core-1",
      maxMessage: 1000,
      maxUnauthenticated: 100,
      preferredMtu: 247,
      window: 8,
    });
  });

  it("accepts a Uint8Array", () => {
    const info = parseBleInfo(
      new Uint8Array(bytes({ v: 1, deviceId: "core-1" })),
    );
    expect(info.deviceId).toBe("core-1");
  });

  it("falls back to defaults for missing or invalid limits", () => {
    const info = parseBleInfo(
      bytes({ v: 1, deviceId: "core-1", window: -1, preferredMtu: 1.5 }),
    );
    expect(info.window).toBe(BLE_DEFAULT_WINDOW);
    expect(info.preferredMtu).toBe(512);
    expect(info.maxMessage).toBe(4 * 1024 * 1024);
    expect(info.maxUnauthenticated).toBe(64 * 1024);
  });

  it("refuses another protocol version", () => {
    expect(() => parseBleInfo(bytes({ v: 2, deviceId: "core-1" }))).toThrow(
      expect.objectContaining({ kind: "unsupported_version" }),
    );
  });

  it.each([
    ["not JSON", Array.from(new TextEncoder().encode("{nope"))],
    ["not an object", bytes(5)],
    ["null", bytes(null)],
    ["no device id", bytes({ v: 1 })],
    ["a blank device id", bytes({ v: 1, deviceId: "  " })],
  ])("refuses %s", (_name, value) => {
    let thrown: unknown;
    try {
      parseBleInfo(value);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(BleInfoError);
    expect((thrown as BleInfoError).kind).toBe("malformed");
  });
});
