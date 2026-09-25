import { beforeEach, describe, expect, it, vi } from "vitest";
import { CoreAPI } from "@/lib/coreApi";
import { RequestCancelledError } from "@/lib/errors";

describe("CoreAPI media lookup", () => {
  let send: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    CoreAPI.reset();
    send = vi.fn();
    CoreAPI.setWsInstance({
      isConnected: true,
      send: send as (data: string) => void,
    });
  });

  it.each([
    null,
    {
      mediaId: 42,
      system: { id: "SNES", name: "SNES" },
      name: "Game",
      path: "/games/Game.sfc",
      zapScript: "@SNES/Game",
      tags: [],
      confidence: 0.95,
    },
  ])("returns the matched game or null", async (match) => {
    const pending = CoreAPI.mediaLookup({
      system: "SNES",
      name: "Game",
      fuzzySystem: true,
    });
    const request = JSON.parse(send.mock.lastCall![0] as string);
    expect(request).toMatchObject({
      method: "media.lookup",
      params: { system: "SNES", name: "Game", fuzzySystem: true },
    });
    await CoreAPI.processReceived(
      new MessageEvent("message", {
        data: JSON.stringify({
          jsonrpc: "2.0",
          id: request.id,
          result: { match },
        }),
      }),
    );
    await expect(pending).resolves.toEqual({ match });
  });

  it("rejects cancelled lookups", async () => {
    const pending = CoreAPI.mediaLookup({ system: "SNES", name: "Game" });
    const request = JSON.parse(send.mock.lastCall![0] as string);
    await CoreAPI.processReceived(
      new MessageEvent("message", {
        data: JSON.stringify({
          jsonrpc: "2.0",
          id: request.id,
          result: { cancelled: true },
        }),
      }),
    );
    await expect(pending).rejects.toBeInstanceOf(RequestCancelledError);
  });
});
