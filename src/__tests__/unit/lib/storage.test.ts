import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getDeviceAddress, setDeviceAddress } from "../../../lib/coreApi";
import { Capacitor } from "@capacitor/core";

describe("Device Address Storage", () => {
  let originalLocalStorage: Storage;
  let originalLocation: Location;

  beforeEach(() => {
    vi.clearAllMocks();

    // Store original values
    originalLocalStorage = window.localStorage;
    originalLocation = window.location;

    // Create fresh localStorage mock for each test
    const localStorageMock = {
      getItem: vi.fn((key: string) => localStorageMock._store[key] || null),
      setItem: vi.fn((key: string, value: string) => {
        localStorageMock._store[key] = value;
      }),
      clear: vi.fn(() => {
        localStorageMock._store = {};
      }),
      _store: {} as { [key: string]: string },
    };

    Object.defineProperty(window, "localStorage", {
      value: localStorageMock,
      writable: true,
      configurable: true,
    });

    // Reset window.location for each test to avoid interference
    Object.defineProperty(window, "location", {
      value: { hostname: "localhost" },
      writable: true,
      configurable: true,
    });

    // Clear the mock store
    localStorageMock.clear();
  });

  afterEach(() => {
    // Restore original values
    Object.defineProperty(window, "localStorage", {
      value: originalLocalStorage,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });

  it("should handle device address retrieval when no address is stored", () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    localStorage.clear(); // Ensure no stored address

    const address = getDeviceAddress();

    // On native platform with no stored address, returns empty string
    // (user must explicitly set a device address)
    expect(address).toBe("");
  });

  it("should use window.location.hostname on web platform when no address stored", () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    localStorage.clear(); // Ensure localStorage is empty
    Object.defineProperty(window, "location", {
      value: { hostname: "localhost" },
      writable: true,
      configurable: true,
    });

    const address = getDeviceAddress();

    expect(address).toBe("localhost");
  });

  it("should save device address to localStorage", () => {
    setDeviceAddress("192.168.1.100");

    expect(localStorage.getItem("deviceAddress")).toBe("192.168.1.100");

    // Note: Preferences.set is also called but due to test environment mocking complexities,
    // we don't test it here. The important behavior is localStorage persistence.
  });

  it("should retrieve stored device address from localStorage", () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    // Clear first, then set the specific value we want to test
    localStorage.clear();
    localStorage.setItem("deviceAddress", "192.168.1.50");

    const address = getDeviceAddress();

    expect(address).toBe("192.168.1.50");
  });
});
