import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppBadgeManager } from "@/components/AppBadgeManager";
import { SlideModalProvider } from "@/components/SlideModalProvider";
import { useAppBadge } from "@/hooks/useAppBadge";
import { render, screen } from "@/test-utils";

const declinePermissionRationale = vi.fn();
const dismissPermissionDeniedHelp = vi.fn();
const requestPermission = vi.fn();

vi.mock("@/hooks/useAppBadge", () => ({
  useAppBadge: vi.fn(),
}));

vi.mock("@/hooks/useHaptics", () => ({
  useHaptics: () => ({ impact: vi.fn() }),
}));

function renderManager() {
  return render(
    <SlideModalProvider>
      <AppBadgeManager />
    </SlideModalProvider>,
  );
}

describe("AppBadgeManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAppBadge).mockReturnValue({
      showPermissionRationale: true,
      showPermissionDeniedHelp: false,
      isRequestingPermission: false,
      declinePermissionRationale,
      dismissPermissionDeniedHelp,
      requestPermission,
    });
  });

  it("should explain badge-only permission before continuing", () => {
    renderManager();

    expect(
      screen.getByRole("dialog", { name: "appBadge.title" }),
    ).toBeInTheDocument();
    expect(screen.getByText("appBadge.description")).toBeInTheDocument();
  });

  it("should decline the rationale without requesting permission", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(screen.getByRole("button", { name: "appBadge.noThanks" }));

    expect(declinePermissionRationale).toHaveBeenCalledOnce();
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("should request permission only after the user continues", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(screen.getByRole("button", { name: "appBadge.continue" }));

    expect(requestPermission).toHaveBeenCalledOnce();
  });

  it("should explain how to recover denied system permission", () => {
    vi.mocked(useAppBadge).mockReturnValue({
      showPermissionRationale: false,
      showPermissionDeniedHelp: true,
      isRequestingPermission: false,
      declinePermissionRationale,
      dismissPermissionDeniedHelp,
      requestPermission,
    });

    renderManager();

    expect(screen.getByText("appBadge.deniedDescription")).toBeInTheDocument();
  });
});
