import { beforeEach, describe, expect, it } from "vitest";
import { renderHook } from "@/test-utils";
import { useClientCapability } from "@/hooks/useClientCapability";
import { ClientCapability } from "@/lib/models";
import { useStatusStore } from "@/lib/store";

describe("useClientCapability", () => {
  beforeEach(() => {
    useStatusStore.setState({ connected: true, currentClient: null });
  });

  it("should deny capabilities while current client is unknown", () => {
    const { result } = renderHook(() =>
      useClientCapability(ClientCapability.SettingsWrite),
    );

    expect(result.current).toBe(false);
  });

  it("should deny cached capabilities while disconnected", () => {
    useStatusStore.setState({
      connected: false,
      currentClient: {
        paired: true,
        role: "admin",
        capabilities: [ClientCapability.SettingsWrite],
      },
    });

    const { result } = renderHook(() =>
      useClientCapability(ClientCapability.SettingsWrite),
    );

    expect(result.current).toBe(false);
  });

  it("should report capabilities granted by Core", () => {
    useStatusStore.setState({
      currentClient: {
        paired: true,
        role: "admin",
        capabilities: [ClientCapability.SettingsWrite],
      },
    });

    const { result } = renderHook(() =>
      useClientCapability(ClientCapability.SettingsWrite),
    );

    expect(result.current).toBe(true);
  });

  it("should deny capabilities omitted by Core", () => {
    useStatusStore.setState({
      currentClient: {
        paired: true,
        role: "member",
        capabilities: [],
      },
    });

    const { result } = renderHook(() =>
      useClientCapability(ClientCapability.ProfilesManage),
    );

    expect(result.current).toBe(false);
  });
});
