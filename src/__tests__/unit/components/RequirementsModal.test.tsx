import { act, render, screen, fireEvent, waitFor } from "@/test-utils";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { RequirementsModal } from "@/components/RequirementsModal";
import { useRequirementsStore } from "@/hooks/useRequirementsModal";
import type { PendingRequirement } from "@/lib/models";

// Mock external dependencies only
vi.mock("@capacitor-firebase/authentication", () => ({
  FirebaseAuthentication: {
    signOut: vi.fn().mockResolvedValue(undefined),
    sendEmailVerification: vi.fn().mockResolvedValue(undefined),
    reload: vi.fn().mockResolvedValue(undefined),
    getIdToken: vi.fn().mockResolvedValue({ token: "mock-token" }),
    getCurrentUser: vi.fn().mockResolvedValue({ user: null }),
  },
}));

vi.mock("@revenuecat/purchases-capacitor", () => ({
  Purchases: {
    logOut: vi.fn().mockResolvedValue(undefined),
    isAnonymous: vi.fn().mockResolvedValue({ isAnonymous: false }),
  },
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: vi.fn().mockReturnValue("ios"),
    isNativePlatform: vi.fn().mockReturnValue(true),
    isPluginAvailable: vi.fn().mockReturnValue(true),
  },
}));

vi.mock("@/lib/onlineApi", () => ({
  updateRequirements: vi.fn().mockResolvedValue({
    requirements: {
      email_verified: true,
      tos_accepted: true,
      privacy_accepted: true,
      age_verified: true,
    },
  }),
  getRequirements: vi.fn().mockResolvedValue({
    requirements: {
      email_verified: true,
      tos_accepted: true,
      privacy_accepted: true,
      age_verified: true,
    },
  }),
}));

vi.mock("@/lib/store", () => ({
  useStatusStore: vi.fn((selector) => {
    const state = {
      setLoggedInUser: vi.fn(),
    };
    return selector(state);
  }),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    log: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("@/hooks/useHaptics", () => ({
  useHaptics: () => ({
    impact: vi.fn(),
    notification: vi.fn(),
    vibrate: vi.fn(),
  }),
}));

describe("RequirementsModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "open").mockImplementation(() => null);
    // Reset the store state
    useRequirementsStore.setState({
      isOpen: false,
      pendingRequirements: [],
    });
  });

  it("should stay mounted and slide open for new requirements", () => {
    render(<RequirementsModal />);
    const dialog = screen.getByRole("dialog", { hidden: true });

    expect(dialog).toHaveStyle({ transform: "translate3d(0, 100%, 0)" });

    act(() => {
      useRequirementsStore.setState({
        isOpen: true,
        pendingRequirements: [
          {
            type: "terms_acceptance",
            description: "Accept terms",
            endpoint: "/account/requirements",
          },
        ],
      });
    });

    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(dialog).toHaveStyle({ transform: "translate3d(0, 0, 0)" });
  });

  it("should render when open with TOS requirement", () => {
    const requirements: PendingRequirement[] = [
      {
        type: "terms_acceptance",
        description: "Accept terms",
        endpoint: "/account/requirements",
      },
    ];

    useRequirementsStore.setState({
      isOpen: true,
      pendingRequirements: requirements,
    });

    render(<RequirementsModal />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // Title may appear multiple times due to test-utils wrapper
    const titles = screen.getAllByText("requirements.title");
    expect(titles.length).toBeGreaterThan(0);
    expect(
      screen.getByRole("checkbox", { name: "requirements.legalLabel" }),
    ).toBeInTheDocument();
  });

  it("should expose legal links without toggling combined consent", async () => {
    const user = userEvent.setup();
    useRequirementsStore.setState({
      isOpen: true,
      pendingRequirements: [
        {
          type: "terms_acceptance",
          description: "Accept terms",
          endpoint: "/account/requirements",
        },
      ],
    });

    render(<RequirementsModal />);

    const termsLink = screen.getByRole("link", {
      name: /requirements\.tosLink/,
    });
    const privacyLink = screen.getByRole("link", {
      name: /requirements\.privacyLink/,
    });
    expect(termsLink).toHaveAttribute("href", "https://zaparoo.com/terms");
    expect(privacyLink).toHaveAttribute("href", "https://zaparoo.com/privacy");
    expect(termsLink.closest("label")).toBeNull();
    expect(privacyLink.closest("label")).toBeNull();
    const legalCheckbox = screen.getByRole("checkbox", {
      name: "requirements.legalLabel",
    });
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);

    await user.click(termsLink);
    expect(legalCheckbox).not.toBeChecked();
    await user.click(privacyLink);
    expect(legalCheckbox).not.toBeChecked();
  });

  it("should render age verification checkbox when required", () => {
    const requirements: PendingRequirement[] = [
      {
        type: "age_verified",
        description: "Verify age",
        endpoint: "/account/requirements",
      },
    ];

    useRequirementsStore.setState({
      isOpen: true,
      pendingRequirements: requirements,
    });

    render(<RequirementsModal />);

    expect(screen.getByLabelText(/requirements\.ageLabel/)).toBeInTheDocument();
  });

  it("should render email verification section when required", () => {
    const requirements: PendingRequirement[] = [
      {
        type: "email_verified",
        description: "Verify email",
        endpoint: "/account/requirements",
      },
    ];

    useRequirementsStore.setState({
      isOpen: true,
      pendingRequirements: requirements,
    });

    render(<RequirementsModal />);

    expect(
      screen.getByRole("button", {
        name: /requirements\.sendVerificationEmail/i,
      }),
    ).toBeInTheDocument();
  });

  it("should enable continue when legal consent is checked", async () => {
    const user = userEvent.setup();
    const requirements: PendingRequirement[] = [
      {
        type: "terms_acceptance",
        description: "Accept terms",
        endpoint: "/account/requirements",
      },
    ];

    useRequirementsStore.setState({
      isOpen: true,
      pendingRequirements: requirements,
    });

    render(<RequirementsModal />);

    const logoutButton = screen.getByRole("button", {
      name: /requirements\.logout/i,
    });
    const continueButton = screen.getByRole("button", {
      name: /requirements\.continue/i,
    });
    expect(logoutButton).toHaveTextContent("requirements.logout");
    expect(continueButton).toBeDisabled();

    await user.click(
      screen.getByRole("checkbox", { name: "requirements.legalLabel" }),
    );

    await waitFor(() => {
      expect(continueButton).not.toBeDisabled();
    });
  });

  it("should enable continue when age is checked", async () => {
    const requirements: PendingRequirement[] = [
      {
        type: "age_verified",
        description: "Verify age",
        endpoint: "/account/requirements",
      },
    ];

    useRequirementsStore.setState({
      isOpen: true,
      pendingRequirements: requirements,
    });

    render(<RequirementsModal />);

    const continueButton = screen.getByRole("button", {
      name: /requirements\.continue/i,
    });
    expect(continueButton).toBeDisabled();

    // Check age
    fireEvent.click(
      screen.getByRole("checkbox", { name: "requirements.ageLabel" }),
    );

    await waitFor(() => {
      expect(continueButton).not.toBeDisabled();
    });
  });

  it("should submit only pending legal requirements", async () => {
    const user = userEvent.setup();
    const requirements: PendingRequirement[] = [
      {
        type: "terms_acceptance",
        description: "Accept terms",
        endpoint: "/account/requirements",
      },
    ];

    useRequirementsStore.setState({
      isOpen: true,
      pendingRequirements: requirements,
    });

    render(<RequirementsModal />);

    await user.click(
      screen.getByRole("checkbox", { name: "requirements.legalLabel" }),
    );
    await user.click(
      screen.getByRole("button", { name: /requirements\.continue/i }),
    );

    const { updateRequirements } = await import("@/lib/onlineApi");
    await waitFor(() => {
      expect(updateRequirements).toHaveBeenCalledWith({
        accept_tos: true,
        accept_privacy: true,
      });
    });
  });

  it("should submit legal and age requirements together", async () => {
    const user = userEvent.setup();
    useRequirementsStore.setState({
      isOpen: true,
      pendingRequirements: [
        {
          type: "terms_acceptance",
          description: "Accept terms",
          endpoint: "/account/requirements",
        },
        {
          type: "age_verified",
          description: "Verify age",
          endpoint: "/account/requirements",
        },
      ],
    });

    render(<RequirementsModal />);

    await user.click(
      screen.getByRole("checkbox", { name: "requirements.legalLabel" }),
    );
    await user.click(
      screen.getByRole("checkbox", { name: "requirements.ageLabel" }),
    );
    await user.click(
      screen.getByRole("button", { name: "requirements.continue" }),
    );

    const { updateRequirements } = await import("@/lib/onlineApi");
    expect(updateRequirements).toHaveBeenCalledOnce();
    expect(updateRequirements).toHaveBeenCalledWith({
      accept_tos: true,
      accept_privacy: true,
      age_verified: true,
    });
  });

  it("should call signOut when logout is clicked", async () => {
    const requirements: PendingRequirement[] = [
      {
        type: "terms_acceptance",
        description: "Accept terms",
        endpoint: "/account/requirements",
      },
    ];

    useRequirementsStore.setState({
      isOpen: true,
      pendingRequirements: requirements,
    });

    render(<RequirementsModal />);

    const logoutButton = screen.getByRole("button", {
      name: /requirements\.logout/i,
    });
    fireEvent.click(logoutButton);

    const { FirebaseAuthentication } =
      await import("@capacitor-firebase/authentication");
    await waitFor(() => {
      expect(FirebaseAuthentication.signOut).toHaveBeenCalled();
    });
  });

  it("should not call Purchases.logOut when RC user is already anonymous", async () => {
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    vi.mocked(Purchases.isAnonymous).mockResolvedValueOnce({
      isAnonymous: true,
    });

    const requirements: PendingRequirement[] = [
      {
        type: "terms_acceptance",
        description: "Accept terms",
        endpoint: "/account/requirements",
      },
    ];

    useRequirementsStore.setState({
      isOpen: true,
      pendingRequirements: requirements,
    });

    render(<RequirementsModal />);

    fireEvent.click(
      screen.getByRole("button", { name: /requirements\.logout/i }),
    );

    const { FirebaseAuthentication } =
      await import("@capacitor-firebase/authentication");
    await waitFor(() => {
      expect(FirebaseAuthentication.signOut).toHaveBeenCalled();
    });

    expect(Purchases.logOut).not.toHaveBeenCalled();
  });

  it("should ignore expected RevenueCat logout state errors", async () => {
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    const { logger } = await import("@/lib/logger");
    vi.mocked(Purchases.logOut).mockRejectedValueOnce(
      new Error("Cannot log out anonymous app user"),
    );

    const requirements: PendingRequirement[] = [
      {
        type: "terms_acceptance",
        description: "Accept terms",
        endpoint: "/account/requirements",
      },
    ];

    useRequirementsStore.setState({
      isOpen: true,
      pendingRequirements: requirements,
    });

    render(<RequirementsModal />);

    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: /requirements\.logout/i }),
    );

    const { FirebaseAuthentication } =
      await import("@capacitor-firebase/authentication");
    await waitFor(() => {
      expect(FirebaseAuthentication.signOut).toHaveBeenCalled();
    });

    expect(logger.error).not.toHaveBeenCalledWith(
      "RevenueCat logout failed:",
      expect.anything(),
      expect.anything(),
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("should log unexpected RevenueCat logout errors", async () => {
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    const { logger } = await import("@/lib/logger");
    const error = new Error("network connection lost");
    vi.mocked(Purchases.logOut).mockRejectedValueOnce(error);

    const requirements: PendingRequirement[] = [
      {
        type: "terms_acceptance",
        description: "Accept terms",
        endpoint: "/account/requirements",
      },
    ];

    useRequirementsStore.setState({
      isOpen: true,
      pendingRequirements: requirements,
    });

    render(<RequirementsModal />);

    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: /requirements\.logout/i }),
    );

    const { FirebaseAuthentication } =
      await import("@capacitor-firebase/authentication");
    await waitFor(() => {
      expect(FirebaseAuthentication.signOut).toHaveBeenCalled();
    });

    expect(logger.error).toHaveBeenCalledWith(
      "RevenueCat logout failed:",
      error,
      expect.objectContaining({ action: "logOut" }),
    );
  });

  it("should send verification email when button clicked", async () => {
    const requirements: PendingRequirement[] = [
      {
        type: "email_verified",
        description: "Verify email",
        endpoint: "/account/requirements",
      },
    ];

    useRequirementsStore.setState({
      isOpen: true,
      pendingRequirements: requirements,
    });

    render(<RequirementsModal />);

    const sendEmailButton = screen.getByRole("button", {
      name: /requirements\.sendVerificationEmail/i,
    });
    fireEvent.click(sendEmailButton);

    const { FirebaseAuthentication } =
      await import("@capacitor-firebase/authentication");
    await waitFor(() => {
      expect(FirebaseAuthentication.sendEmailVerification).toHaveBeenCalled();
    });
  });

  it("should show check email verified button after sending email", async () => {
    const requirements: PendingRequirement[] = [
      {
        type: "email_verified",
        description: "Verify email",
        endpoint: "/account/requirements",
      },
    ];

    useRequirementsStore.setState({
      isOpen: true,
      pendingRequirements: requirements,
    });

    render(<RequirementsModal />);

    // Click send email
    const sendEmailButton = screen.getByRole("button", {
      name: /requirements\.sendVerificationEmail/i,
    });
    fireEvent.click(sendEmailButton);

    // Wait for the UI to update to show the "I've verified" button
    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: /requirements\.checkEmailVerified/i,
        }),
      ).toBeInTheDocument();
    });
  });

  it("should handle multiple requirement types", () => {
    const requirements: PendingRequirement[] = [
      {
        type: "terms_acceptance",
        description: "Accept terms",
        endpoint: "/account/requirements",
      },
      {
        type: "age_verified",
        description: "Verify age",
        endpoint: "/account/requirements",
      },
      {
        type: "email_verified",
        description: "Verify email",
        endpoint: "/account/requirements",
      },
    ];

    useRequirementsStore.setState({
      isOpen: true,
      pendingRequirements: requirements,
    });

    render(<RequirementsModal />);

    expect(
      screen.getByRole("checkbox", { name: "requirements.legalLabel" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "requirements.ageLabel" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /requirements\.sendVerificationEmail/i,
      }),
    ).toBeInTheDocument();
  });

  it("should reset checkbox state when modal reopens", async () => {
    const requirements: PendingRequirement[] = [
      {
        type: "terms_acceptance",
        description: "Accept terms",
        endpoint: "/account/requirements",
      },
    ];

    // Open modal and check a box
    useRequirementsStore.setState({
      isOpen: true,
      pendingRequirements: requirements,
    });

    const { rerender } = render(<RequirementsModal />);

    const legalCheckbox = screen.getByRole("checkbox", {
      name: "requirements.legalLabel",
    });
    fireEvent.click(legalCheckbox);
    expect(legalCheckbox).toBeChecked();

    // Close modal
    useRequirementsStore.setState({
      isOpen: false,
      pendingRequirements: [],
    });

    rerender(<RequirementsModal />);

    // Reopen modal
    useRequirementsStore.setState({
      isOpen: true,
      pendingRequirements: requirements,
    });

    rerender(<RequirementsModal />);

    // Checkbox should be unchecked again - get by role again after rerender
    const reopenedLegalCheckbox = screen.getByRole("checkbox", {
      name: "requirements.legalLabel",
    });
    expect(reopenedLegalCheckbox).not.toBeChecked();
  });

  describe("email verification check flow", () => {
    it("should show check button after sending verification email", async () => {
      const requirements: PendingRequirement[] = [
        {
          type: "email_verified",
          description: "Verify email",
          endpoint: "/account/requirements",
        },
      ];

      useRequirementsStore.setState({
        isOpen: true,
        pendingRequirements: requirements,
      });

      render(<RequirementsModal />);

      // Send email first
      const sendEmailButton = screen.getByRole("button", {
        name: /requirements\.sendVerificationEmail/i,
      });
      fireEvent.click(sendEmailButton);

      // Wait for the "I've verified" button to appear
      await waitFor(() => {
        expect(
          screen.getByRole("button", {
            name: /requirements\.checkEmailVerified/i,
          }),
        ).toBeInTheDocument();
      });
    });

    it("should call Firebase reload when check button is clicked", async () => {
      const requirements: PendingRequirement[] = [
        {
          type: "email_verified",
          description: "Verify email",
          endpoint: "/account/requirements",
        },
      ];

      useRequirementsStore.setState({
        isOpen: true,
        pendingRequirements: requirements,
      });

      const { FirebaseAuthentication } =
        await import("@capacitor-firebase/authentication");

      render(<RequirementsModal />);

      // Send email first
      const sendEmailButton = screen.getByRole("button", {
        name: /requirements\.sendVerificationEmail/i,
      });
      fireEvent.click(sendEmailButton);

      await waitFor(() => {
        expect(
          screen.getByRole("button", {
            name: /requirements\.checkEmailVerified/i,
          }),
        ).toBeInTheDocument();
      });

      // Click check email verified
      const checkButton = screen.getByRole("button", {
        name: /requirements\.checkEmailVerified/i,
      });
      fireEvent.click(checkButton);

      // Wait for Firebase reload to be called
      await waitFor(() => {
        expect(FirebaseAuthentication.reload).toHaveBeenCalled();
      });
    });

    it("should show resend email option after sending", async () => {
      const requirements: PendingRequirement[] = [
        {
          type: "email_verified",
          description: "Verify email",
          endpoint: "/account/requirements",
        },
      ];

      useRequirementsStore.setState({
        isOpen: true,
        pendingRequirements: requirements,
      });

      render(<RequirementsModal />);

      // Send email first
      const sendEmailButton = screen.getByRole("button", {
        name: /requirements\.sendVerificationEmail/i,
      });
      fireEvent.click(sendEmailButton);

      // Should show resend email button
      await waitFor(() => {
        expect(
          screen.getByText("requirements.resendEmail"),
        ).toBeInTheDocument();
      });
    });

    // Regression test: Modal should close when only email verification was pending,
    // even if other requirements (TOS, privacy, age) are false in the API response
    it("should close modal when email is verified and it was the only pending requirement", async () => {
      const user = userEvent.setup();
      const requirements: PendingRequirement[] = [
        {
          type: "email_verified",
          description: "Verify email",
          endpoint: "/account/requirements",
        },
      ];

      useRequirementsStore.setState({
        isOpen: true,
        pendingRequirements: requirements,
      });

      const { FirebaseAuthentication } =
        await import("@capacitor-firebase/authentication");
      const { getRequirements } = await import("@/lib/onlineApi");

      // Mock email as verified
      vi.mocked(FirebaseAuthentication.getCurrentUser).mockResolvedValue({
        user: { emailVerified: true } as never,
      });

      // Mock API response where only email_verified is true,
      // other requirements are false (the bug scenario)
      vi.mocked(getRequirements).mockResolvedValue({
        requirements: {
          email_verified: true,
          tos_accepted: false,
          privacy_accepted: false,
          age_verified: false,
        },
        required_versions: { tos: "1.0", privacy: "1.0" },
        accepted_versions: { tos: null, privacy: null },
      });

      render(<RequirementsModal />);

      // Send email first
      const sendEmailButton = screen.getByRole("button", {
        name: /requirements\.sendVerificationEmail/i,
      });
      await user.click(sendEmailButton);

      // Click check email verified
      const checkButton = await screen.findByRole("button", {
        name: /requirements\.checkEmailVerified/i,
      });
      await user.click(checkButton);

      // Modal should close
      await waitFor(() => {
        expect(useRequirementsStore.getState().isOpen).toBe(false);
      });
    });

    it("should NOT close modal when email is verified but other pending requirements remain", async () => {
      const user = userEvent.setup();
      // This tests the case where both email and TOS are pending
      const requirements: PendingRequirement[] = [
        {
          type: "email_verified",
          description: "Verify email",
          endpoint: "/account/requirements",
        },
        {
          type: "terms_acceptance",
          description: "Accept terms",
          endpoint: "/account/requirements",
        },
      ];

      useRequirementsStore.setState({
        isOpen: true,
        pendingRequirements: requirements,
      });

      const { FirebaseAuthentication } =
        await import("@capacitor-firebase/authentication");
      const { getRequirements } = await import("@/lib/onlineApi");

      // Mock email as verified
      vi.mocked(FirebaseAuthentication.getCurrentUser).mockResolvedValue({
        user: { emailVerified: true } as never,
      });

      // Email is verified but TOS is not accepted
      vi.mocked(getRequirements).mockResolvedValue({
        requirements: {
          email_verified: true,
          tos_accepted: false,
          privacy_accepted: false,
          age_verified: false,
        },
        required_versions: { tos: "1.0", privacy: "1.0" },
        accepted_versions: { tos: null, privacy: null },
      });

      render(<RequirementsModal />);

      // Send email first
      const sendEmailButton = screen.getByRole("button", {
        name: /requirements\.sendVerificationEmail/i,
      });
      await user.click(sendEmailButton);

      // Click check email verified
      const checkButton = await screen.findByRole("button", {
        name: /requirements\.checkEmailVerified/i,
      });
      await user.click(checkButton);

      // Should show email verified message but NOT close modal
      await waitFor(() => {
        expect(
          screen.getByText("requirements.emailVerified"),
        ).toBeInTheDocument();
      });

      // Modal should still be open (other requirements still pending)
      expect(useRequirementsStore.getState().isOpen).toBe(true);
    });
  });
});
