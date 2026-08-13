import { beforeEach, describe, expect, it, vi } from "vitest";
import { CoreAPI } from "@/lib/coreApi";
import { RequestCancelledError } from "@/lib/errors";

describe("CoreAPI profile methods", () => {
  let mockSend: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    CoreAPI.reset();
    mockSend = vi.fn();
    CoreAPI.setWsInstance({
      isConnected: true,
      send: mockSend as (data: string) => void,
    });
  });

  const sentRequest = () =>
    JSON.parse(mockSend.mock.calls[0]![0] as string) as {
      method: string;
      params?: unknown;
    };

  it("should list profiles", () => {
    void CoreAPI.profiles().catch(() => undefined);

    expect(sentRequest().method).toBe("profiles");
  });

  it("should create profiles", () => {
    void CoreAPI.newProfile({
      name: "Kid A",
      role: "member",
      pin: "1234",
    }).catch(() => undefined);

    expect(sentRequest()).toMatchObject({
      method: "profiles.new",
      params: { name: "Kid A", role: "member", pin: "1234" },
    });
  });

  it("should update profiles", () => {
    void CoreAPI.updateProfile({
      profileId: "profile-1",
      name: "Kid B",
      clearLimits: true,
    }).catch(() => undefined);

    expect(sentRequest()).toMatchObject({
      method: "profiles.update",
      params: {
        profileId: "profile-1",
        name: "Kid B",
        clearLimits: true,
      },
    });
  });

  it("should delete profiles", () => {
    void CoreAPI.deleteProfile("profile-1").catch(() => undefined);

    expect(sentRequest()).toMatchObject({
      method: "profiles.delete",
      params: { profileId: "profile-1" },
    });
  });

  it("should get active profile", () => {
    void CoreAPI.activeProfile().catch(() => undefined);

    expect(sentRequest().method).toBe("profiles.active");
  });

  it("should switch to protected profile", () => {
    void CoreAPI.switchProfile({
      profileId: "profile-1",
      pin: "1234",
    }).catch(() => undefined);

    expect(sentRequest()).toMatchObject({
      method: "profiles.switch",
      params: { profileId: "profile-1", pin: "1234" },
    });
  });

  it("should switch to shared profile without params", () => {
    void CoreAPI.switchProfile().catch(() => undefined);

    expect(sentRequest().method).toBe("profiles.switch");
    expect(sentRequest().params).toBeUndefined();
  });

  it("should reject cancelled profile responses", async () => {
    const promise = CoreAPI.profiles();
    const request = sentRequest();
    const payload = JSON.parse(mockSend.mock.calls[0]![0] as string) as {
      id: string;
    };

    await CoreAPI.processReceived(
      new MessageEvent("message", {
        data: JSON.stringify({
          jsonrpc: "2.0",
          id: payload.id,
          result: { cancelled: true },
        }),
      }),
    );

    expect(request.method).toBe("profiles");
    await expect(promise).rejects.toBeInstanceOf(RequestCancelledError);
  });
});
