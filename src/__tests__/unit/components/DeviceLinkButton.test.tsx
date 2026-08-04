import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import type { User } from "@capacitor-firebase/authentication";
import { render, screen } from "@/test-utils";
import { DeviceLinkButton } from "@/components/DeviceLinkButton";
import { useStatusStore } from "@/lib/store";

const { mockNavigate, mockLinkDevice, mockUseDeviceLinking } = vi.hoisted(
  () => ({
    mockNavigate: vi.fn(),
    mockLinkDevice: vi.fn(),
    mockUseDeviceLinking: vi.fn(),
  }),
);

const signedInUser: User = {
  displayName: null,
  email: "user@example.com",
  emailVerified: true,
  isAnonymous: false,
  metadata: {},
  phoneNumber: null,
  photoUrl: null,
  providerData: [],
  providerId: "password",
  tenantId: null,
  uid: "user-123",
};

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ navigate: mockNavigate }),
}));

vi.mock("@/hooks/useDeviceLinking", () => ({
  useDeviceLinking: (enabled: boolean) => mockUseDeviceLinking(enabled),
}));

describe("DeviceLinkButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStatusStore.setState({
      loggedInUser: signedInUser,
      coreVersion: "2.16.0",
    });
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
    useStatusStore.setState({ loggedInUser: null });
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

    useStatusStore.setState({ coreVersion: "2.15.9" });
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
