import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen } from "@/test-utils";
import { MediaDetailsModal } from "@/components/MediaDetailsModal";
import type { SearchResultGame } from "@/lib/models";
import { usePreferencesStore } from "@/lib/preferencesStore";

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
  beforeEach(() => {
    usePreferencesStore.setState({ showFilenames: false });
  });

  it("should show available media details", () => {
    renderModal();

    expect(
      screen.getByRole("dialog", { name: "Super Mario World" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Super Nintendo")).toBeInTheDocument();
    expect(screen.getByLabelText("genre platformer")).toBeInTheDocument();
    expect(screen.getByLabelText("year 1990")).toBeInTheDocument();
    expect(
      screen.getByText("/games/snes/Super Mario World.sfc"),
    ).toBeInTheDocument();
    expect(screen.getByText("@SNES/Super Mario World")).toBeInTheDocument();
  });

  it("should default to ZapScript when available", () => {
    renderModal();

    expect(
      screen.getByRole("radio", {
        name: /create\.search\.zapscriptLabel/i,
      }),
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

  it("should pass selected path to every supplied action", async () => {
    const user = userEvent.setup();
    const onWrite = vi.fn();
    const onCopy = vi.fn();
    const onPreview = vi.fn();
    renderModal({ onWrite, onCopy, onPreview });

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

    expect(onWrite).toHaveBeenCalledWith(mediaWithZapScript.path);
    expect(onCopy).toHaveBeenCalledWith(mediaWithZapScript.path);
    expect(onPreview).toHaveBeenCalledWith(mediaWithZapScript.path);
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
