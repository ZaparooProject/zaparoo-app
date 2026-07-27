/**
 * Unit Tests: CoreAPI URL Parsing
 *
 * Tests for URL parsing and construction functions in coreApi.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getWsUrl,
  getDeviceAddress,
  setDeviceAddress,
  validateDeviceAddress,
} from "@/lib/coreApi";

describe("CoreAPI URL Functions", () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe("getDeviceAddress", () => {
    it("should return empty string when no address is stored on native", async () => {
      // Mock native platform
      const { Capacitor } = await import("@capacitor/core");
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);

      const address = getDeviceAddress();
      expect(address).toBe("");

      // Reset mock
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    });

    it("should return stored address from localStorage", () => {
      localStorage.setItem("deviceAddress", "192.168.1.100");

      const address = getDeviceAddress();
      expect(address).toBe("192.168.1.100");
    });

    it("should return hostname on web platform when no address stored", () => {
      // On web (non-native), it should fall back to window.location.hostname
      const address = getDeviceAddress();
      // In test environment, hostname is typically 'localhost' or similar
      expect(typeof address).toBe("string");
    });
  });

  describe("setDeviceAddress", () => {
    it("should store address in localStorage", () => {
      setDeviceAddress("10.0.0.50");
      expect(localStorage.getItem("deviceAddress")).toBe("10.0.0.50");
    });

    it("should overwrite existing address", () => {
      localStorage.setItem("deviceAddress", "old-address");
      setDeviceAddress("new-address");
      expect(localStorage.getItem("deviceAddress")).toBe("new-address");
    });
  });

  describe("getWsUrl", () => {
    it("should use default port 7497 for simple IPv4 address", () => {
      localStorage.setItem("deviceAddress", "192.168.1.100");

      const url = getWsUrl();
      expect(url).toBe("ws://192.168.1.100:7497/api/v0.1");
    });

    it("should use custom port when specified", () => {
      localStorage.setItem("deviceAddress", "192.168.1.100:8080");

      const url = getWsUrl();
      expect(url).toBe("ws://192.168.1.100:8080/api/v0.1");
    });

    it("should handle hostname addresses", () => {
      localStorage.setItem("deviceAddress", "mydevice.local");

      const url = getWsUrl();
      expect(url).toBe("ws://mydevice.local:7497/api/v0.1");
    });

    it("should handle hostname with custom port", () => {
      localStorage.setItem("deviceAddress", "mydevice.local:9000");

      const url = getWsUrl();
      expect(url).toBe("ws://mydevice.local:9000/api/v0.1");
    });

    it("should use wss for secure stored URLs", () => {
      localStorage.setItem("deviceAddress", "wss://mydevice.local:9000");

      const url = getWsUrl();
      expect(url).toBe("wss://mydevice.local:9000/api/v0.1");
    });

    it("should reject invalid port number (out of range)", () => {
      localStorage.setItem("deviceAddress", "192.168.1.100:99999");

      const url = getWsUrl();
      expect(url).toBe("");
    });

    it("should reject zero port", () => {
      localStorage.setItem("deviceAddress", "192.168.1.100:0");

      const url = getWsUrl();
      expect(url).toBe("");
    });

    it("should reject negative port", () => {
      localStorage.setItem("deviceAddress", "192.168.1.100:-1");

      const url = getWsUrl();
      expect(url).toBe("");
    });

    it("should reject non-numeric port", () => {
      localStorage.setItem("deviceAddress", "192.168.1.100:abc");

      const url = getWsUrl();
      expect(url).toBe("");
    });

    it("should handle unbracketed IPv6 by wrapping in brackets", () => {
      localStorage.setItem("deviceAddress", "::1");
      const url = getWsUrl();
      expect(url).toBe("ws://[::1]:7497/api/v0.1");
    });

    it("should handle bracketed IPv6 with port", () => {
      localStorage.setItem("deviceAddress", "[::1]:8080");
      const url = getWsUrl();
      expect(url).toBe("ws://[::1]:8080/api/v0.1");
    });

    it("should handle common loopback addresses", () => {
      localStorage.setItem("deviceAddress", "127.0.0.1");

      const url = getWsUrl();
      expect(url).toBe("ws://127.0.0.1:7497/api/v0.1");
    });

    it("should handle port at boundary of valid range", () => {
      localStorage.setItem("deviceAddress", "192.168.1.100:65535");

      const url = getWsUrl();
      expect(url).toBe("ws://192.168.1.100:65535/api/v0.1");
    });

    it("should handle port 1 (minimum valid)", () => {
      localStorage.setItem("deviceAddress", "192.168.1.100:1");

      const url = getWsUrl();
      expect(url).toBe("ws://192.168.1.100:1/api/v0.1");
    });

    it("should reject trailing colon", () => {
      localStorage.setItem("deviceAddress", "192.168.1.100:");
      const url = getWsUrl();
      expect(url).toBe("");
    });

    it("should reject invalid IPv4 octets before WebSocket construction", () => {
      localStorage.setItem("deviceAddress", "192.168.1.286");
      const url = getWsUrl();
      expect(url).toBe("");
    });

    it("should reject addresses without a host", () => {
      localStorage.setItem("deviceAddress", ":8080");
      const url = getWsUrl();
      expect(url).toBe("");
    });
  });

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
      const result = validateDeviceAddress(
        "http://mydevice.local:9000/api/v0.1",
      );
      expect(result).toEqual({
        ok: true,
        address: "http://mydevice.local:9000",
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
        address: "https://mydevice.local:9000",
        host: "mydevice.local",
        port: 9000,
        wsUrl: "wss://mydevice.local:9000/api/v0.1",
      });
    });

    it("should reject malformed IPv6", () => {
      const result = validateDeviceAddress("2001:::1");
      expect(result.ok).toBe(false);
    });

    it("should reject URL paths beyond the Core API endpoint", () => {
      const result = validateDeviceAddress("http://mydevice.local/other");
      expect(result.ok).toBe(false);
    });
  });
});
