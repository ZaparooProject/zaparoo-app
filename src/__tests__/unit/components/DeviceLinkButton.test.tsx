import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen } from "@/test-utils";
import { DeviceLinkButton } from "@/components/DeviceLinkButton";

const { mockNavigate, mockLinkDevice, mockUseDeviceLinking, mockStatus } =
  vi.hoisted(() => ({
    mockNavigate: vi.fn(),
    mockLinkDevice: vi.fn(),
    mockUseDeviceLinking: vi.fn(),
    mockStatus: {
      loggedInUser: { uid: "user-123" } as { uid: string } | null,
      coreVersion: "2.16.0" as string | null,
    },
  }));

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ navigate: mockNavigate }),
}));

vi.mock("@/hooks/useDeviceLinking", () => ({
  useDeviceLinking: (enabled: boolean) => mockUseDeviceLinking(enabled),
}));

vi.mock("@/lib/store", () => ({
  useStatusStore: (selector: (state: typeof mockStatus) => unknown) =>
    selector(mockStatus),
}));

describe("DeviceLinkButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStatus.loggedInUser = { uid: "user-123" };
    mockStatus.coreVersion = "2.16.0";
    mockUseDeviceLinking.mockReturnValue({
      state: "unlinked",
      linkDevice: mockLinkDevice,
    });
  });

  it("should link a signed-in active device", async () => {
    const user = userEvent.setup();
    render(<DeviceLinkButton enabled />);

    await user.click(
      screen.getByRole("button", { name: "online.deviceLink.link" }),
    );

    expect(mockLinkDevice).toHaveBeenCalledOnce();
  });

  it("should direct signed-out users to Online settings", async () => {
    mockStatus.loggedInUser = null;
    const user = userEvent.setup();
    render(<DeviceLinkButton enabled />);

    await user.click(
      screen.getByRole("button", { name: "online.deviceLink.signIn" }),
    );

    expect(mockNavigate).toHaveBeenCalledWith({ to: "/settings/online" });
  });

  it("should disable the action for an already-linked device", () => {
    mockUseDeviceLinking.mockReturnValue({
      state: "linked",
      linkDevice: mockLinkDevice,
    });

    render(<DeviceLinkButton enabled />);

    expect(
      screen.getByRole("button", { name: "online.deviceLink.linked" }),
    ).toBeDisabled();
  });

  it("should show a disabled checking state", () => {
    mockUseDeviceLinking.mockReturnValue({
      state: "checking",
      linkDevice: mockLinkDevice,
    });

    render(<DeviceLinkButton enabled />);

    expect(
      screen.getByRole("button", { name: "online.deviceLink.checking" }),
    ).toBeDisabled();
  });

  it("should hide inactive linking and explain unsupported Core", () => {
    const { rerender } = render(<DeviceLinkButton enabled={false} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();

    mockStatus.coreVersion = "2.15.9";
    rerender(<DeviceLinkButton enabled />);
    expect(
      screen.getByRole("button", { name: "online.deviceLink.updateCore" }),
    ).toBeDisabled();
  });

  it("should report device link state changes", () => {
    const onStateChange = vi.fn();
    const { rerender } = render(
      <DeviceLinkButton enabled onStateChange={onStateChange} />,
    );

    expect(onStateChange).toHaveBeenLastCalledWith("unlinked");

    mockUseDeviceLinking.mockReturnValue({
      state: "linked",
      linkDevice: mockLinkDevice,
    });
    rerender(<DeviceLinkButton enabled onStateChange={onStateChange} />);

    expect(onStateChange).toHaveBeenLastCalledWith("linked");
  });
});
