import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, within } from "@/test-utils";
import { MediaDetailsModal } from "@/components/MediaDetailsModal";
import { CoreAPI } from "@/lib/coreApi";
import type { SearchResultGame } from "@/lib/models";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { useStatusStore } from "@/lib/store";
import { seedActiveDevice } from "@/test-utils/deviceRegistry";

vi.mock("@/hooks/useHaptics", () => ({
  useHaptics: () => ({
    impact: vi.fn(),
    notification: vi.fn(),
    vibrate: vi.fn(),
  }),
}));

const mediaWithZapScript: SearchResultGame = {
  system: {
    id: "SNES",
    name: "Super Nintendo",
  },
  name: "Super Mario World",
  path: "/games/snes/Super Mario World.sfc",
  zapScript: "@SNES/Super Mario World",
  tags: [
    { type: "genre", tag: "platformer" },
    { type: "year", tag: "1990" },
    { type: "scraper.gamelist.xml", tag: "scraped" },
  ],
  disambiguatingTags: [{ type: "year", tag: "1990" }],
};

function renderModal(
  overrides: Partial<React.ComponentProps<typeof MediaDetailsModal>> = {},
) {
  const props: React.ComponentProps<typeof MediaDetailsModal> = {
    isOpen: true,
    close: vi.fn(),
    media: mediaWithZapScript,
    onWrite: vi.fn(),
    ...overrides,
  };

  return { ...render(<MediaDetailsModal {...props} />), props };
}

describe("MediaDetailsModal", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    usePreferencesStore.setState({ showFilenames: false });
    await seedActiveDevice({ recordId: "device-a" });
    useStatusStore.setState({
      connected: true,
      coreVersion: "2.15.0",
      coreVersionPending: false,
    });
  });

  it("should show available media details", () => {
    renderModal();

    expect(
      screen.getByRole("dialog", { name: "Super Mario World" }),
    ).toBeInTheDocument();
    expect(screen.getByText("SNES")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "genre platformer" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "year 1990" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("scraper.gamelist.xml scraped"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("/games/snes/Super Mario World.sfc"),
    ).toBeInTheDocument();
    expect(screen.getByText("@SNES/Super Mario World")).toBeInTheDocument();
  });

  it("should show labels for interactive media tags", () => {
    renderModal({
      media: {
        ...mediaWithZapScript,
        tags: [
          ...mediaWithZapScript.tags,
          { type: "edition", tag: "special", label: "Special Edition" },
        ],
      },
    });

    expect(
      screen.getByRole("button", { name: "edition Special Edition" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Special Edition")).toBeInTheDocument();
    expect(screen.queryByText("edition:special")).not.toBeInTheDocument();
  });

  it("should show labels for read-only media tags", () => {
    renderModal({
      media: {
        ...mediaWithZapScript,
        zapScript: "**launch:/games/snes/Super Mario World.sfc",
        tags: [
          ...mediaWithZapScript.tags,
          { type: "edition", tag: "special", label: "Special Edition" },
        ],
      },
    });

    expect(screen.getByText("Special Edition")).toBeInTheDocument();
    expect(screen.queryByText("edition:special")).not.toBeInTheDocument();
  });

  it("should show labelled secondary actions before the primary action", () => {
    renderModal({ onCopy: vi.fn(), onPreview: vi.fn() });

    const favorite = screen.getByRole("button", {
      name: "library.addFavorite",
    });
    const copy = screen.getByRole("button", {
      name: "create.search.copyLabel",
    });
    const preview = screen.getByRole("button", {
      name: "create.search.playLabel",
    });
    const write = screen.getByRole("button", {
      name: "create.search.writeLabel",
    });

    const actions = screen.getByRole("group", {
      name: "create.search.mediaActions",
    });
    expect(favorite).toHaveTextContent("library.favorite");
    expect(copy).toHaveTextContent("create.search.copyLabel");
    expect(preview).toHaveTextContent("create.search.playLabel");
    expect(
      within(actions).getByRole("button", { name: "library.addFavorite" }),
    ).toBe(favorite);
    expect(
      within(actions).queryByRole("button", {
        name: "create.search.writeLabel",
      }),
    ).not.toBeInTheDocument();
    expect(
      copy.compareDocumentPosition(write) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("should add a favorite from indexed-media details", async () => {
    const updateSpy = vi.spyOn(CoreAPI, "mediaTagsUpdate").mockResolvedValue({
      tags: [{ type: "user", tag: "favorite" }],
    });
    const user = userEvent.setup();
    renderModal();

    await user.click(
      screen.getByRole("button", { name: "library.addFavorite" }),
    );

    expect(updateSpy).toHaveBeenCalledWith({
      system: "SNES",
      path: "/games/snes/Super Mario World.sfc",
      add: ["user:favorite"],
    });
  });

  it("should default to ZapScript when available", () => {
    renderModal();

    expect(
      screen.getByRole("radio", {
        name: /create\.search\.zapscriptLabel/i,
      }),
    ).toBeChecked();
  });

  it("should remember the selected write mode for the session", async () => {
    const user = userEvent.setup();
    const view = renderModal();

    await user.click(
      screen.getByRole("radio", { name: /create\.search\.pathLabel/i }),
    );
    view.unmount();
    renderModal();

    expect(
      screen.getByRole("radio", { name: /create\.search\.pathLabel/i }),
    ).toBeChecked();
  });

  it("should select and remove Core ZapScript tags", async () => {
    const user = userEvent.setup();
    renderModal({
      media: {
        ...mediaWithZapScript,
        zapScript: "@SNES/Super Mario World (year:1990)",
      },
    });

    const selectedTag = screen.getByRole("button", { name: "year 1990" });
    expect(selectedTag).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "genre platformer" }),
    ).toHaveAttribute("aria-pressed", "false");

    await user.click(selectedTag);

    expect(selectedTag).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("@SNES/Super Mario World")).toBeInTheDocument();
  });

  it("should rebuild grouped ZapScript tags for every action", async () => {
    const user = userEvent.setup();
    const onWrite = vi.fn();
    const onCopy = vi.fn();
    const onPreview = vi.fn();
    renderModal({
      media: {
        ...mediaWithZapScript,
        zapScript: "@SNES/Super Mario World (year:1990)",
        tags: [
          ...mediaWithZapScript.tags,
          { type: "region", tag: "us" },
          { type: "region", tag: "eu" },
        ],
      },
      onWrite,
      onCopy,
      onPreview,
    });

    await user.click(screen.getByRole("button", { name: "region us" }));
    await user.click(screen.getByRole("button", { name: "region eu" }));

    const customizedZapScript =
      "@SNES/Super Mario World (year:1990) (region:us, region:eu)";
    expect(screen.getByText(customizedZapScript)).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /create\.search\.writeLabel/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /create\.search\.copyLabel/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /create\.search\.playLabel/i }),
    );

    expect(onWrite).toHaveBeenCalledWith(customizedZapScript);
    expect(onCopy).toHaveBeenCalledWith(customizedZapScript);
    expect(onPreview).toHaveBeenCalledWith(customizedZapScript);
  });

  it("should leave tags read-only for unsupported ZapScript", async () => {
    const user = userEvent.setup();
    const onWrite = vi.fn();
    renderModal({
      media: {
        ...mediaWithZapScript,
        zapScript: "**launch:/games/snes/Super Mario World.sfc",
      },
      onWrite,
    });

    expect(
      screen.queryByRole("button", { name: "genre platformer" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("genre platformer")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /create\.search\.writeLabel/i }),
    );
    expect(onWrite).toHaveBeenCalledWith(
      "**launch:/games/snes/Super Mario World.sfc",
    );
  });

  it("should default to path when ZapScript is unavailable", () => {
    renderModal({
      media: {
        ...mediaWithZapScript,
        zapScript: undefined,
        tags: [],
      },
    });

    expect(
      screen.getByRole("radio", { name: /create\.search\.pathLabel/i }),
    ).toBeChecked();
    expect(
      screen.queryByRole("radio", {
        name: /create\.search\.zapscriptLabel/i,
      }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("genre platformer")).not.toBeInTheDocument();
  });

  it("should treat whitespace-only ZapScript as unavailable", async () => {
    const user = userEvent.setup();
    const onWrite = vi.fn();
    renderModal({
      media: {
        ...mediaWithZapScript,
        zapScript: "   ",
        tags: [],
      },
      onWrite,
    });

    expect(
      screen.getByRole("radio", { name: /create\.search\.pathLabel/i }),
    ).toBeChecked();
    expect(
      screen.queryByRole("radio", {
        name: /create\.search\.zapscriptLabel/i,
      }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /create\.search\.writeLabel/i }),
    );
    expect(onWrite).toHaveBeenCalledWith(mediaWithZapScript.path);
  });

  it("should pass selected path to every supplied action", async () => {
    const user = userEvent.setup();
    const onWrite = vi.fn();
    const onCopy = vi.fn();
    const onPreview = vi.fn();
    renderModal({
      media: {
        ...mediaWithZapScript,
        relativePath: "SNES/Super Mario World.sfc",
      },
      onWrite,
      onCopy,
      onPreview,
    });

    await user.click(
      screen.getByRole("radio", { name: /create\.search\.pathLabel/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /create\.search\.writeLabel/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /create\.search\.copyLabel/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /create\.search\.playLabel/i }),
    );

    expect(onWrite).toHaveBeenCalledWith("SNES/Super Mario World.sfc");
    expect(onCopy).toHaveBeenCalledWith("SNES/Super Mario World.sfc");
    expect(onPreview).toHaveBeenCalledWith("SNES/Super Mario World.sfc");
  });

  it("should omit optional copy and preview actions", () => {
    renderModal();

    expect(
      screen.getByRole("button", { name: /create\.search\.writeLabel/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /create\.search\.copyLabel/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /create\.search\.playLabel/i }),
    ).not.toBeInTheDocument();
  });

  it("should honor filename display preference in title", () => {
    usePreferencesStore.setState({ showFilenames: true });
    renderModal({
      media: {
        ...mediaWithZapScript,
        path: "/games/snes/Super Mario World (USA).sfc",
      },
    });

    expect(
      screen.getByRole("dialog", { name: "Super Mario World (USA)" }),
    ).toBeInTheDocument();
  });
});
