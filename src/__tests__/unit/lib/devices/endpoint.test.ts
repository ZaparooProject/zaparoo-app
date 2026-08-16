/**
 * Unit Tests: device endpoint parsing
 *
 * Every stored endpoint and every address the user types goes through
 * `parseDeviceEndpoint`, so the two can never disagree about what a host means.
 * That makes this the one place host/port validation is exercised.
 */

import { describe, it, expect } from "vitest";
import {
  DEFAULT_DEVICE_PORT,
  formatDeviceEndpoint,
  isValidHost,
  parseDeviceEndpoint,
} from "@/lib/devices/endpoint";

function endpointOf(input: string) {
  const result = parseDeviceEndpoint(input);
  if (!result.ok) throw new Error(`expected "${input}" to parse`);
  return result.endpoint;
}

describe("parseDeviceEndpoint", () => {
  describe("hosts and ports", () => {
    it("should default the port when none is given", () => {
      expect(endpointOf("192.168.1.100")).toMatchObject({
        host: "192.168.1.100",
        port: DEFAULT_DEVICE_PORT,
        address: "192.168.1.100",
        wsUrl: "ws://192.168.1.100:7497/api/v0.1",
      });
    });

    it("should keep an explicit port in the display address", () => {
      expect(endpointOf("192.168.1.100:8080")).toMatchObject({
        port: 8080,
        address: "192.168.1.100:8080",
        wsUrl: "ws://192.168.1.100:8080/api/v0.1",
      });
    });

    it("should accept hostnames", () => {
      expect(endpointOf("MyDevice.local")).toMatchObject({
        host: "mydevice.local",
        port: DEFAULT_DEVICE_PORT,
      });
    });

    it("should accept the port range boundaries", () => {
      expect(endpointOf("192.168.1.100:1").port).toBe(1);
      expect(endpointOf("192.168.1.100:65535").port).toBe(65535);
    });

    it("should trim surrounding whitespace", () => {
      expect(endpointOf("  192.168.1.100:8080  ").address).toBe(
        "192.168.1.100:8080",
      );
    });

    it.each([
      ["a port above the valid range", "192.168.1.100:99999"],
      ["a zero port", "192.168.1.100:0"],
      ["a negative port", "192.168.1.100:-1"],
      ["a non-numeric port", "192.168.1.100:abc"],
      ["a trailing colon", "192.168.1.100:"],
      ["an out-of-range IPv4 octet", "192.168.1.286"],
      ["a missing host", ":8080"],
      ["an empty string", ""],
      ["embedded whitespace", "192.168.1.100 :8080"],
      // Multiple colons without hex segments is not IPv6, so it must be
      // rejected rather than silently bracketed.
      ["multiple colons that are not IPv6", "my:host:name"],
    ])("should reject %s", (_label, input) => {
      expect(parseDeviceEndpoint(input).ok).toBe(false);
    });
  });

  describe("IPv6", () => {
    it("should bracket an unbracketed address", () => {
      expect(endpointOf("::1")).toMatchObject({
        host: "::1",
        port: DEFAULT_DEVICE_PORT,
        address: "[::1]",
        wsUrl: "ws://[::1]:7497/api/v0.1",
      });
    });

    it("should accept a bracketed address with a port", () => {
      expect(endpointOf("[::1]:8080")).toMatchObject({
        host: "::1",
        port: 8080,
        wsUrl: "ws://[::1]:8080/api/v0.1",
      });
    });

    it("should reject malformed IPv6", () => {
      expect(parseDeviceEndpoint("2001:::1").ok).toBe(false);
    });

    // Two spellings of one address must not become two devices, so the
    // canonical form is what gets stored and compared.
    it.each([
      ["an expanded loopback", "0:0:0:0:0:0:0:1"],
      ["a zero-padded group", "::0001"],
      ["a bracketed expanded address", "[0:0:0:0:0:0:0:1]"],
    ])("should canonicalise %s", (_label, input) => {
      expect(endpointOf(input).host).toBe("::1");
      expect(endpointOf(input).endpointId).toBe(endpointOf("::1").endpointId);
    });

    it("should lowercase and compress a link-local address", () => {
      expect(endpointOf("[FE80::0001]:8080")).toMatchObject({
        host: "fe80::1",
        port: 8080,
        wsUrl: "ws://[fe80::1]:8080/api/v0.1",
      });
    });
  });

  describe("pasted URLs", () => {
    it("should accept a Core API URL and drop its path", () => {
      expect(endpointOf("http://mydevice.local:9000/api/v0.1")).toMatchObject({
        scheme: "ws",
        host: "mydevice.local",
        port: 9000,
        address: "mydevice.local:9000",
      });
    });

    it("should map https and wss to a secure socket", () => {
      expect(endpointOf("https://mydevice.local:9000")).toMatchObject({
        scheme: "wss",
        address: "wss://mydevice.local:9000",
        wsUrl: "wss://mydevice.local:9000/api/v0.1",
      });
      expect(endpointOf("wss://mydevice.local:9000").scheme).toBe("wss");
    });

    // A port matching the scheme default is erased by the URL parser, so
    // without recovering it from the raw authority these all silently became
    // 7497 — a device the user never asked to dial.
    it.each([
      ["http and 80", "http://mydevice.local:80", 80],
      ["https and 443", "https://mydevice.local:443", 443],
      ["ws and 80", "ws://mydevice.local:80", 80],
      ["wss and 443", "wss://mydevice.local:443", 443],
      ["a zero-padded default port", "http://mydevice.local:080", 80],
    ])("should keep an explicit port matching %s", (_label, input, port) => {
      expect(endpointOf(input).port).toBe(port);
    });

    it("should not read an IPv6 group as a port", () => {
      expect(endpointOf("http://[::80]")).toMatchObject({
        host: "::80",
        port: DEFAULT_DEVICE_PORT,
      });
    });

    it("should still default the port when none is given", () => {
      expect(endpointOf("http://mydevice.local").port).toBe(
        DEFAULT_DEVICE_PORT,
      );
    });

    it.each([
      ["an unsupported scheme", "ftp://mydevice.local"],
      ["a path beyond the Core API endpoint", "http://mydevice.local/other"],
      ["a query string", "http://mydevice.local/?x=1"],
      ["a fragment", "http://mydevice.local/#x"],
      ["embedded credentials", "http://user:pass@mydevice.local"],
      ["a trailing colon with no port", "http://mydevice.local:"],
    ])("should reject %s", (_label, input) => {
      expect(parseDeviceEndpoint(input).ok).toBe(false);
    });
  });

  it("should produce a stable endpoint id for equivalent inputs", () => {
    const bare = endpointOf("MyDevice.local");
    const explicit = endpointOf("mydevice.local:7497");
    const url = endpointOf("ws://mydevice.local:7497/api/v0.1");

    expect(explicit.endpointId).toBe(bare.endpointId);
    expect(url.endpointId).toBe(bare.endpointId);
  });
});

describe("formatDeviceEndpoint", () => {
  it("should hide the default port from the display address", () => {
    expect(
      formatDeviceEndpoint("192.168.1.100", DEFAULT_DEVICE_PORT),
    ).toMatchObject({
      address: "192.168.1.100",
      endpointId: "ws://192.168.1.100:7497",
    });
  });

  it("should lowercase the host", () => {
    expect(formatDeviceEndpoint("MyDevice.Local", 7497).host).toBe(
      "mydevice.local",
    );
  });
});

describe("isValidHost", () => {
  it.each(["192.168.1.100", "127.0.0.1", "::1", "mydevice.local", "core"])(
    "should accept %s",
    (host) => {
      expect(isValidHost(host)).toBe(true);
    },
  );

  it.each(["", "192.168.1.286", "-leading.local", "trailing-.local", "a..b"])(
    "should reject %s",
    (host) => {
      expect(isValidHost(host)).toBe(false);
    },
  );
});
