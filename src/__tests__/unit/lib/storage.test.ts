import { describe, it, expect, vi, beforeEach } from "vitest";
import { getDeviceAddress, setDeviceAddress } from "../../../lib/coreApi";
import { Preferences } from "@capacitor/preferences";
import { Capacitor } from "@capacitor/core";

vi.mock("@capacitor/preferences", () => import("../../../__mocks__/@capacitor/preferences"));
vi.mock("@capacitor/core");

describe("Device Address Storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("should initialize with empty string when no address stored", () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    
    const address = getDeviceAddress();
    
    expect(address).toBe("");
  });

  it("should use window.location.hostname on web platform when no address stored", () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    Object.defineProperty(window, 'location', {
      value: { hostname: 'localhost' },
      writable: true
    });
    
    const address = getDeviceAddress();
    
    expect(address).toBe("localhost");
  });

  it("should save device address to both localStorage and Preferences", () => {
    const mockPrefsSet = vi.mocked(Preferences.set).mockResolvedValue();
    
    setDeviceAddress("192.168.1.100");
    
    expect(localStorage.getItem("deviceAddress")).toBe("192.168.1.100");
    expect(mockPrefsSet).toHaveBeenCalledWith({
      key: "deviceAddress",
      value: "192.168.1.100"
    });
  });

  it("should retrieve stored device address from localStorage", () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    localStorage.setItem("deviceAddress", "192.168.1.50");
    
    const address = getDeviceAddress();
    
    expect(address).toBe("192.168.1.50");
  });
});