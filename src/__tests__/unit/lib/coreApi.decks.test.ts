import { beforeEach, describe, expect, it, vi } from "vitest";
import { CoreAPI } from "@/lib/coreApi";
import { RequestCancelledError } from "@/lib/errors";

describe("CoreAPI deck methods", () => {
  let send: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    CoreAPI.reset();
    send = vi.fn();
    CoreAPI.setWsInstance({
      isConnected: true,
      send: send as (data: string) => void,
    });
  });
  const request = () =>
    JSON.parse(send.mock.lastCall![0] as string) as {
      id: string;
      method: string;
      params?: unknown;
    };

  it("lists and gets decks", () => {
    void CoreAPI.decks().catch(() => undefined);
    expect(request().method).toBe("decks");
    void CoreAPI.deckGet("0k3v9x2rq7bm").catch(() => undefined);
    expect(request()).toMatchObject({
      method: "decks.get",
      params: { deckId: "0k3v9x2rq7bm" },
    });
  });

  it("creates empty decks and accepts ID-only card members", () => {
    void CoreAPI.deckNew({ name: "Empty" }).catch(() => undefined);
    expect(request()).toMatchObject({
      method: "decks.new",
      params: { name: "Empty" },
    });
    void CoreAPI.deckNew({
      name: "Cards",
      items: [{ kind: "card", cardId: "CARD0001" }],
    }).catch(() => undefined);
    expect(request()).toMatchObject({
      method: "decks.new",
      params: { name: "Cards", items: [{ kind: "card", cardId: "CARD0001" }] },
    });
  });

  it("appends media, reorders existing IDs, deletes, and opens", () => {
    void CoreAPI.deckUpdate({
      deckId: "0k3v9x2rq7bm",
      addItems: [{ kind: "media", system: "SNES", path: "/games/a.sfc" }],
    }).catch(() => undefined);
    expect(request()).toMatchObject({
      method: "decks.update",
      params: {
        addItems: [{ kind: "media", system: "SNES", path: "/games/a.sfc" }],
      },
    });
    void CoreAPI.deckUpdate({
      deckId: "0k3v9x2rq7bm",
      items: [{ id: 7 }, { id: 4 }],
    }).catch(() => undefined);
    expect(request()).toMatchObject({
      method: "decks.update",
      params: { items: [{ id: 7 }, { id: 4 }] },
    });
    void CoreAPI.deckDelete("0k3v9x2rq7bm").catch(() => undefined);
    expect(request()).toMatchObject({
      method: "decks.delete",
      params: { deckId: "0k3v9x2rq7bm" },
    });
    void CoreAPI.deckOpen("0k3v9x2rq7bm").catch(() => undefined);
    expect(request()).toMatchObject({
      method: "decks.open",
      params: { deckId: "0k3v9x2rq7bm" },
    });
  });

  it("rejects cancelled deck requests", async () => {
    const pending = CoreAPI.deckGet("0k3v9x2rq7bm");
    await CoreAPI.processReceived(
      new MessageEvent("message", {
        data: JSON.stringify({
          jsonrpc: "2.0",
          id: request().id,
          result: { cancelled: true },
        }),
      }),
    );
    await expect(pending).rejects.toBeInstanceOf(RequestCancelledError);
  });
});
