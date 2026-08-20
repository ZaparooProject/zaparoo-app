import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@/test-utils";
import userEvent from "@testing-library/user-event";
import type { User } from "@capacitor-firebase/authentication";
import toast from "react-hot-toast";
import { NotSignedInError } from "@/lib/onlineApi";
import { CoreAPI } from "@/lib/coreApi";
import { usePurchasePreviewStore } from "@/lib/purchasePreviewStore";
import { useStatusStore } from "@/lib/store";

type StatusStoreState = ReturnType<typeof useStatusStore.getState>;

// Use vi.hoisted for all variables that need to be accessed in mock factories
const {
  componentRef,
  mockGoBack,
  mockFirebaseAuth,
  mockMfaAuthentication,
  mockPurchasesLogOut,
  mockBrowserOpen,
  mockDeleteAccount,
  mockCancelAccountDeletion,
  mockUpdateRequirements,
  mockSetLoggedInUser,
  defaultStatusStoreState,
  mockState,
} = vi.hoisted(() => ({
  componentRef: { current: null as any },
  mockGoBack: vi.fn(),
  mockFirebaseAuth: {
    signOut: vi.fn(),
    signInWithEmailAndPassword: vi.fn(),
    createUserWithEmailAndPassword: vi.fn(),
    signInWithGoogle: vi.fn(),
    signInWithApple: vi.fn(),
    sendPasswordResetEmail: vi.fn(),
    sendEmailVerification: vi.fn(),
    getCurrentUser: vi.fn(),
  },
  mockMfaAuthentication: {
    signInWithEmailAndPassword: vi.fn(),
    signInWithGoogle: vi.fn(),
    signInWithApple: vi.fn(),
    resolveTotpSignIn: vi.fn(),
    cancelSignIn: vi.fn(),
  },
  mockPurchasesLogOut: vi.fn(),
  mockBrowserOpen: vi.fn(),
  mockDeleteAccount: vi.fn(),
  mockCancelAccountDeletion: vi.fn(),
  mockUpdateRequirements: vi.fn(),
  mockSetLoggedInUser: vi.fn<(loggedInUser: User | null) => void>(),
  defaultStatusStoreState: {} as StatusStoreState,
  mockState: {
    loggedInUser: null as User | null,
    platform: "web" as string,
    connected: false,
  },
}));

type UserFixture = Omit<Partial<User>, "providerData"> & {
  providerData?: Array<{ providerId: string }>;
};

function authenticatedUser(overrides: UserFixture = {}): User {
  const { providerData = [{ providerId: "password" }], ...userOverrides } =
    overrides;

  return {
    displayName: null,
    email: null,
    emailVerified: true,
    isAnonymous: false,
    metadata: {},
    phoneNumber: null,
    photoUrl: null,
    providerData: providerData.map(({ providerId }) => ({
      displayName: null,
      email: null,
      phoneNumber: null,
      photoUrl: null,
      providerId,
      uid: "test-provider-uid",
    })),
    providerId: providerData[0]?.providerId ?? "password",
    tenantId: null,
    uid: "test-uid",
    ...userOverrides,
  };
}

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    createFileRoute: () => (options: any) => {
      componentRef.current = options.component;
      return { options };
    },
    useRouter: () => ({ navigate: mockGoBack }),
  };
});

// Mock toast
vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock Firebase Authentication
vi.mock("@capacitor-firebase/authentication", () => ({
  FirebaseAuthentication: mockFirebaseAuth,
}));

vi.mock("@/lib/mfaAuthentication", () => ({
  MfaAuthentication: mockMfaAuthentication,
}));

// Mock RevenueCat
vi.mock("@revenuecat/purchases-capacitor", () => ({
  Purchases: {
    logOut: () => mockPurchasesLogOut(),
    isAnonymous: vi.fn().mockResolvedValue({ isAnonymous: false }),
  },
}));

// Mock Capacitor
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => mockState.platform !== "web",
    getPlatform: () => mockState.platform,
  },
}));

// Mock Browser
vi.mock("@capacitor/browser", () => ({
  Browser: {
    open: mockBrowserOpen,
  },
}));

// Mock onlineApi — spread actual module so non-function exports (e.g. NotSignedInError) are real
vi.mock("@/lib/onlineApi", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    updateRequirements: (...args: unknown[]) => mockUpdateRequirements(...args),
    deleteAccount: (...args: unknown[]) => mockDeleteAccount(...args),
    cancelAccountDeletion: () => mockCancelAccountDeletion(),
  };
});

// Mock store
vi.mock("@/lib/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/store")>();
  Object.assign(defaultStatusStoreState, actual.useStatusStore.getState());

  const mockUseStatusStore = <T,>(
    selector: (state: StatusStoreState) => T,
  ): T =>
    selector({
      ...actual.useStatusStore.getState(),
      loggedInUser: mockState.loggedInUser,
      connected: mockState.connected,
      setLoggedInUser: mockSetLoggedInUser,
    });
  const useStatusStoreAdapter = Object.assign(
    mockUseStatusStore,
    actual.useStatusStore,
  );

  return {
    ...actual,
    useStatusStore: useStatusStoreAdapter,
  };
});

// Mock hooks
vi.mock("@/hooks/useSmartSwipe", () => ({
  useSmartSwipe: () => ({}),
}));

vi.mock("@/hooks/usePageHeadingFocus", () => ({
  usePageHeadingFocus: vi.fn(),
}));

// Mock logger
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), log: vi.fn() },
}));

vi.mock("@/components/WarpSubscription", () => ({
  WarpSubscription: ({ appUserID }: { appUserID: string }) => (
    <div data-testid="warp-subscription">{appUserID}</div>
  ),
}));

vi.mock("@/components/OnlineDeviceSetup", () => ({
  OnlineDeviceSetup: ({
    connected,
    warpActive,
  }: {
    connected: boolean;
    warpActive: boolean | null;
  }) => (
    <div
      data-testid="online-device-setup"
      data-connected={String(connected)}
      data-warp-active={String(warpActive)}
    />
  ),
}));

// Import the route module to trigger createFileRoute which captures the component
import "@/routes/settings.online";

// The component will be captured by the mock
const getOnline = () => componentRef.current;

describe("Settings Online Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.platform = "web";
    mockState.connected = false;
    mockState.loggedInUser = null;
    useStatusStore.setState(
      {
        ...defaultStatusStoreState,
        connected: false,
        loggedInUser: null,
        setLoggedInUser: mockSetLoggedInUser,
      },
      true,
    );
    usePurchasePreviewStore.setState({ state: "live" });
    CoreAPI.reset();

    // Reset Firebase mocks with default implementations
    mockFirebaseAuth.signOut.mockResolvedValue(undefined);
    mockMfaAuthentication.signInWithEmailAndPassword.mockResolvedValue({
      mfaRequired: false,
    });
    mockMfaAuthentication.signInWithGoogle.mockResolvedValue({
      mfaRequired: false,
    });
    mockMfaAuthentication.signInWithApple.mockResolvedValue({
      mfaRequired: false,
    });
    mockMfaAuthentication.resolveTotpSignIn.mockResolvedValue(undefined);
    mockMfaAuthentication.cancelSignIn.mockResolvedValue(undefined);
    mockFirebaseAuth.getCurrentUser.mockResolvedValue({
      user: {
        email: "test@example.com",
        uid: "test-uid",
        displayName: "Test User",
        emailVerified: true,
        providerData: [{ providerId: "password" }],
      },
    });
    mockFirebaseAuth.sendPasswordResetEmail.mockResolvedValue(undefined);
    mockFirebaseAuth.sendEmailVerification.mockResolvedValue(undefined);
    mockPurchasesLogOut.mockResolvedValue(undefined);
    mockDeleteAccount.mockResolvedValue({
      scheduled_deletion_at: "2024-02-15T00:00:00Z",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderComponent = () => {
    const Online = getOnline();
    return render(<Online />);
  };

  describe("rendering - logged out state", () => {
    it("should render the page title", () => {
      renderComponent();
      expect(
        screen.getByRole("heading", { name: "online.title" }),
      ).toBeInTheDocument();
    });

    it("should render email input", () => {
      renderComponent();
      expect(screen.getByText("online.email")).toBeInTheDocument();
    });

    it("should render password input", () => {
      renderComponent();
      expect(screen.getByText("online.password")).toBeInTheDocument();
    });

    it("should render login button", () => {
      renderComponent();
      expect(
        screen.getByRole("button", { name: "online.login" }),
      ).toBeInTheDocument();
    });

    it("should render forgot password link", () => {
      renderComponent();
      expect(screen.getByText("online.forgotPassword")).toBeInTheDocument();
    });

    it("should render signup toggle link", () => {
      renderComponent();
      expect(screen.getByText("online.switchToSignUpLink")).toBeInTheDocument();
    });

    it("should render description text", () => {
      renderComponent();
      expect(screen.getByText("online.description")).toBeInTheDocument();
    });

    it("should render terms and privacy links", () => {
      renderComponent();
      expect(screen.getByText("online.termsOfService")).toBeInTheDocument();
      expect(screen.getByText("online.privacyPolicy")).toBeInTheDocument();
    });

    it("should render the purchase preview without authentication", () => {
      usePurchasePreviewStore.getState().setPreviewState("checkout");

      renderComponent();

      expect(screen.getByText("purchase-preview")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "online.login" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("rendering - logged in state", () => {
    beforeEach(() => {
      mockState.loggedInUser = authenticatedUser({
        email: "loggedin@example.com",
        uid: "logged-in-uid",
        displayName: "Logged In User",
        emailVerified: true,
        providerData: [{ providerId: "password" }],
      });
    });

    it("should render user email", () => {
      renderComponent();
      expect(screen.getByText("loggedin@example.com")).toBeInTheDocument();
    });

    it("should render user display name", () => {
      renderComponent();
      expect(screen.getByText("Logged In User")).toBeInTheDocument();
    });

    it("should render logout button", () => {
      renderComponent();
      expect(
        screen.getByRole("button", { name: "online.logout" }),
      ).toBeInTheDocument();
    });

    it("should render dashboard button", () => {
      renderComponent();
      expect(
        screen.getByRole("button", { name: "online.dashboard" }),
      ).toBeInTheDocument();
    });

    it("should render Warp management only for logged-in native users", () => {
      mockState.platform = "ios";

      renderComponent();

      expect(screen.getByTestId("warp-subscription")).toHaveTextContent(
        "logged-in-uid",
      );
    });

    it("should render Warp management for development preview on web", () => {
      usePurchasePreviewStore.getState().setPreviewState("free");

      renderComponent();

      expect(screen.getByTestId("warp-subscription")).toHaveTextContent(
        "logged-in-uid",
      );
    });

    it("should pass preview Warp access into device setup", () => {
      usePurchasePreviewStore.getState().setPreviewState("warp");

      renderComponent();

      expect(screen.getByTestId("online-device-setup")).toHaveAttribute(
        "data-warp-active",
        "true",
      );
    });

    it.each(["free", "pro"] as const)(
      "should pass inactive %s preview access into device setup",
      (state) => {
        usePurchasePreviewStore.getState().setPreviewState(state);

        renderComponent();

        expect(screen.getByTestId("online-device-setup")).toHaveAttribute(
          "data-warp-active",
          "false",
        );
      },
    );

    it.each(["loading", "error"] as const)(
      "should preserve unresolved %s preview access in device setup",
      (state) => {
        usePurchasePreviewStore.getState().setPreviewState(state);

        renderComponent();

        expect(screen.getByTestId("online-device-setup")).toHaveAttribute(
          "data-warp-active",
          "null",
        );
      },
    );

    it("should present device setup before Warp membership", () => {
      mockState.platform = "ios";

      renderComponent();

      const setup = screen.getByTestId("online-device-setup");
      const membership = screen.getByTestId("warp-subscription");
      expect(
        setup.compareDocumentPosition(membership) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it("should render Online device setup for the connected device", () => {
      mockState.connected = true;

      renderComponent();

      expect(screen.getByTestId("online-device-setup")).toHaveAttribute(
        "data-connected",
        "true",
      );
    });

    it("should render delete account button", () => {
      renderComponent();
      expect(
        screen.getByRole("button", { name: "online.deleteAccount" }),
      ).toBeInTheDocument();
    });

    it("should render change password button for password users", () => {
      renderComponent();
      expect(
        screen.getByRole("button", { name: "online.changePassword" }),
      ).toBeInTheDocument();
    });

    it("should not render change password button for OAuth users", () => {
      mockState.loggedInUser = authenticatedUser({
        ...mockState.loggedInUser,
        providerData: [{ providerId: "google.com" }],
      });
      renderComponent();
      expect(
        screen.queryByRole("button", { name: "online.changePassword" }),
      ).not.toBeInTheDocument();
    });

    it("should show Google login indicator for Google users", () => {
      mockState.loggedInUser = authenticatedUser({
        ...mockState.loggedInUser,
        providerData: [{ providerId: "google.com" }],
      });
      renderComponent();
      expect(screen.getByText("online.loggedInWithGoogle")).toBeInTheDocument();
    });

    it("should show Apple login indicator for Apple users", () => {
      mockState.loggedInUser = authenticatedUser({
        ...mockState.loggedInUser,
        providerData: [{ providerId: "apple.com" }],
      });
      renderComponent();
      expect(screen.getByText("online.loggedInWithApple")).toBeInTheDocument();
    });

    it("should not infer latest login method from a linked provider", () => {
      mockState.loggedInUser = authenticatedUser({
        ...mockState.loggedInUser,
        providerData: [
          { providerId: "google.com" },
          { providerId: "password" },
        ],
      });

      renderComponent();

      expect(
        screen.queryByText("online.loggedInWithGoogle"),
      ).not.toBeInTheDocument();
    });
  });

  describe("mode toggle", () => {
    it("should switch to signup mode when clicking signup link", async () => {
      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByText("online.switchToSignUpLink"));

      // Should now show signup button
      expect(
        screen.getByRole("button", { name: "online.signUp" }),
      ).toBeInTheDocument();
      // Should show age confirmation checkbox
      expect(screen.getByText("online.ageConfirmLabel")).toBeInTheDocument();
      // Should show switch to login link
      expect(screen.getByText("online.switchToLogInLink")).toBeInTheDocument();
    });

    it("should switch back to login mode", async () => {
      const user = userEvent.setup();
      renderComponent();

      // Switch to signup
      await user.click(screen.getByText("online.switchToSignUpLink"));
      // Switch back to login
      await user.click(screen.getByText("online.switchToLogInLink"));

      expect(
        screen.getByRole("button", { name: "online.login" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("online.ageConfirmLabel"),
      ).not.toBeInTheDocument();
    });
  });

  describe("logout", () => {
    beforeEach(() => {
      mockState.loggedInUser = authenticatedUser({
        email: "test@example.com",
        uid: "test-uid",
        displayName: "Test User",
        emailVerified: true,
        providerData: [{ providerId: "password" }],
      });
    });

    it("should call Firebase signOut and clear user state on logout", async () => {
      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByRole("button", { name: "online.logout" }));

      await waitFor(() => {
        expect(mockFirebaseAuth.signOut).toHaveBeenCalled();
      });
    });

    it("should call RevenueCat logout before Firebase signOut on native platform", async () => {
      const user = userEvent.setup();
      mockState.platform = "ios";
      renderComponent();

      await user.click(screen.getByRole("button", { name: "online.logout" }));

      await waitFor(() => {
        expect(mockPurchasesLogOut).toHaveBeenCalled();
        expect(mockFirebaseAuth.signOut).toHaveBeenCalled();
      });

      expect(mockPurchasesLogOut.mock.invocationCallOrder[0]!).toBeLessThan(
        mockFirebaseAuth.signOut.mock.invocationCallOrder[0]!,
      );
    });

    it("should not call Purchases.logOut when RC user is already anonymous on native platform", async () => {
      const user = userEvent.setup();
      mockState.platform = "ios";

      const { Purchases } = await import("@revenuecat/purchases-capacitor");
      vi.mocked(Purchases.isAnonymous).mockResolvedValueOnce({
        isAnonymous: true,
      });

      renderComponent();

      await user.click(screen.getByRole("button", { name: "online.logout" }));

      await waitFor(() => {
        expect(mockFirebaseAuth.signOut).toHaveBeenCalled();
      });

      expect(mockPurchasesLogOut).not.toHaveBeenCalled();
    });

    it("should ignore expected RevenueCat logout state errors on native platform", async () => {
      const user = userEvent.setup();
      const { logger } = await import("@/lib/logger");
      mockState.platform = "ios";
      mockPurchasesLogOut.mockRejectedValueOnce(
        new Error("Cannot log out anonymous app user"),
      );

      renderComponent();

      await user.click(screen.getByRole("button", { name: "online.logout" }));

      await waitFor(() => {
        expect(mockFirebaseAuth.signOut).toHaveBeenCalled();
      });

      expect(logger.error).not.toHaveBeenCalled();
    });

    it("should log unexpected RevenueCat logout errors on native platform", async () => {
      const user = userEvent.setup();
      const { logger } = await import("@/lib/logger");
      mockState.platform = "ios";
      const error = new Error("network connection lost");
      mockPurchasesLogOut.mockRejectedValueOnce(error);

      renderComponent();

      await user.click(screen.getByRole("button", { name: "online.logout" }));

      await waitFor(() => {
        expect(mockFirebaseAuth.signOut).toHaveBeenCalled();
      });

      expect(logger.error).toHaveBeenCalledWith(
        "RevenueCat logout failed:",
        error,
        expect.objectContaining({ action: "logOut" }),
      );
    });

    it("should skip RevenueCat logout on web platform", async () => {
      const user = userEvent.setup();
      mockState.platform = "web";
      renderComponent();

      await user.click(screen.getByRole("button", { name: "online.logout" }));

      await waitFor(() => {
        expect(mockFirebaseAuth.signOut).toHaveBeenCalled();
      });

      expect(mockPurchasesLogOut).not.toHaveBeenCalled();
    });
  });

  describe("external links", () => {
    beforeEach(() => {
      mockState.loggedInUser = authenticatedUser({
        email: "test@example.com",
        uid: "test-uid",
        displayName: "Test User",
        emailVerified: true,
        providerData: [{ providerId: "password" }],
      });
    });

    it("should open dashboard when button clicked", async () => {
      const user = userEvent.setup();
      renderComponent();

      await user.click(
        screen.getByRole("button", { name: "online.dashboard" }),
      );

      expect(mockBrowserOpen).toHaveBeenCalledWith({
        url: "https://online.zaparoo.com",
      });
    });
  });

  describe("password reset", () => {
    beforeEach(() => {
      mockState.loggedInUser = authenticatedUser({
        email: "test@example.com",
        uid: "test-uid",
        displayName: "Test User",
        emailVerified: true,
        providerData: [{ providerId: "password" }],
      });
    });

    it("should send password reset email when change password clicked", async () => {
      const user = userEvent.setup();
      renderComponent();

      await user.click(
        screen.getByRole("button", { name: "online.changePassword" }),
      );

      await waitFor(() => {
        expect(mockFirebaseAuth.sendPasswordResetEmail).toHaveBeenCalledWith({
          email: "test@example.com",
        });
      });

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith("online.resetEmailSent");
      });
    });

    it("should handle password reset email failure", async () => {
      const user = userEvent.setup();
      mockFirebaseAuth.sendPasswordResetEmail.mockRejectedValueOnce(
        new Error("Failed"),
      );

      renderComponent();

      await user.click(
        screen.getByRole("button", { name: "online.changePassword" }),
      );

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("online.resetEmailFailed");
      });
    });
  });

  describe("account deletion", () => {
    beforeEach(() => {
      mockState.loggedInUser = authenticatedUser({
        email: "test@example.com",
        uid: "test-uid",
        displayName: "Test User",
        emailVerified: true,
        providerData: [{ providerId: "password" }],
      });
    });

    it("should open delete confirmation dialog", async () => {
      const user = userEvent.setup();
      renderComponent();
      const dialog = screen
        .getByText("online.deleteAccountConfirmTitle", { selector: "h2" })
        .closest('[role="dialog"]')!;
      expect(dialog).toHaveStyle({ transform: "translate3d(0, 100%, 0)" });

      await user.click(
        screen.getByRole("button", { name: "online.deleteAccount" }),
      );

      expect(
        screen.getByRole("dialog", {
          name: "online.deleteAccountConfirmTitle",
        }),
      ).toBe(dialog);
      expect(dialog).toHaveStyle({ transform: "translate3d(0, 0, 0)" });
      expect(
        screen.getByText("online.deleteAccountConfirmMessage"),
      ).toBeInTheDocument();
    });

    it("should disable delete button until confirmation text matches", async () => {
      const user = userEvent.setup();
      renderComponent();

      await user.click(
        screen.getByRole("button", { name: "online.deleteAccount" }),
      );

      const confirmInput = screen.getByPlaceholderText("DELETE MY ACCOUNT");
      const deleteButtons = screen.getAllByRole("button", {
        name: /online.deleteAccount/,
      });
      const confirmDeleteButton = deleteButtons[deleteButtons.length - 1];

      expect(confirmDeleteButton).toBeDisabled();

      await user.type(confirmInput, "DELETE MY ACCOUNT");

      expect(confirmDeleteButton).not.toBeDisabled();
    });

    it("should call deleteAccount API when confirmed", async () => {
      const user = userEvent.setup();
      renderComponent();

      await user.click(
        screen.getByRole("button", { name: "online.deleteAccount" }),
      );

      const confirmInput = screen.getByPlaceholderText("DELETE MY ACCOUNT");
      await user.type(confirmInput, "DELETE MY ACCOUNT");

      const deleteButtons = screen.getAllByRole("button", {
        name: /online.deleteAccount/,
      });
      const confirmDeleteButton = deleteButtons[deleteButtons.length - 1]!;
      await user.click(confirmDeleteButton);

      await waitFor(() => {
        expect(mockDeleteAccount).toHaveBeenCalledWith("DELETE MY ACCOUNT");
      });
    });

    it("should close dialog on cancel", async () => {
      const user = userEvent.setup();
      renderComponent();

      await user.click(
        screen.getByRole("button", { name: "online.deleteAccount" }),
      );

      expect(
        screen.getByText("online.deleteAccountConfirmTitle"),
      ).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "nav.cancel" }));

      expect(
        screen.queryByRole("dialog", {
          name: "online.deleteAccountConfirmTitle",
        }),
      ).not.toBeInTheDocument();
    });
  });

  describe("navigation", () => {
    it("should navigate back when back button clicked", async () => {
      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByLabelText("nav.back"));

      expect(mockGoBack).toHaveBeenCalledWith({
        to: "/settings",
        resetScroll: false,
      });
    });
  });

  describe("email/password authentication", () => {
    it("should login with email and password", async () => {
      const user = userEvent.setup();
      renderComponent();

      // Enter credentials
      const emailInput = screen.getByPlaceholderText("me@example.com");
      const passwordInput = screen.getByLabelText("online.password");

      await user.type(emailInput, "test@example.com");
      await user.type(passwordInput, "password123");

      // Click login
      await user.click(screen.getByRole("button", { name: "online.login" }));

      await waitFor(() => {
        expect(
          mockMfaAuthentication.signInWithEmailAndPassword,
        ).toHaveBeenCalledWith({
          email: "test@example.com",
          password: "password123",
        });
      });
    });

    it("should show the email login method for a linked Google account", async () => {
      const user = userEvent.setup();
      const Online = getOnline();
      const view = render(<Online />);
      mockFirebaseAuth.getCurrentUser.mockResolvedValueOnce({
        user: {
          email: "test@example.com",
          uid: "test-uid",
          displayName: "Test User",
          emailVerified: true,
          providerData: [
            { providerId: "google.com" },
            { providerId: "password" },
          ],
        },
      });

      await user.type(
        screen.getByPlaceholderText("me@example.com"),
        "test@example.com",
      );
      await user.type(screen.getByLabelText("online.password"), "password123");
      await user.click(screen.getByRole("button", { name: "online.login" }));

      await waitFor(() => {
        expect(mockSetLoggedInUser).toHaveBeenCalled();
      });
      mockState.loggedInUser = authenticatedUser({
        email: "test@example.com",
        uid: "test-uid",
        displayName: "Test User",
        emailVerified: true,
        providerData: [
          { providerId: "google.com" },
          { providerId: "password" },
        ],
      });
      view.rerender(<Online />);

      expect(
        screen.getByText("online.loggedInWithPassword"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("online.loggedInWithGoogle"),
      ).not.toBeInTheDocument();
    });

    it("should show error toast without logging expected login failure", async () => {
      const user = userEvent.setup();
      const { logger } = await import("@/lib/logger");
      mockMfaAuthentication.signInWithEmailAndPassword.mockRejectedValueOnce(
        new Error("auth/invalid-credential"),
      );

      renderComponent();

      const emailInput = screen.getByPlaceholderText("me@example.com");
      const passwordInput = screen.getByLabelText("online.password");

      await user.type(emailInput, "test@example.com");
      await user.type(passwordInput, "wrong");

      await user.click(screen.getByRole("button", { name: "online.login" }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("online.loginWrong");
      });
      expect(logger.error).not.toHaveBeenCalled();
    });

    it("should signup with email and password when age confirmed", async () => {
      const user = userEvent.setup();
      mockFirebaseAuth.createUserWithEmailAndPassword.mockResolvedValueOnce({
        user: {
          email: "new@example.com",
          uid: "new-uid",
          displayName: null,
          emailVerified: false,
          providerData: [{ providerId: "password" }],
        },
      });
      mockUpdateRequirements.mockResolvedValueOnce({});

      renderComponent();

      // Switch to signup mode
      await user.click(screen.getByText("online.switchToSignUpLink"));

      // Enter credentials
      const emailInput = screen.getByPlaceholderText("me@example.com");
      const passwordInput = screen.getByLabelText("online.password");

      await user.type(emailInput, "new@example.com");
      await user.type(passwordInput, "password123");

      // Confirm age
      const ageCheckbox = screen.getByRole("checkbox");
      await user.click(ageCheckbox);

      // Click signup
      await user.click(screen.getByRole("button", { name: "online.signUp" }));

      await waitFor(() => {
        expect(
          mockFirebaseAuth.createUserWithEmailAndPassword,
        ).toHaveBeenCalledWith({
          email: "new@example.com",
          password: "password123",
        });
      });

      await waitFor(() => {
        expect(mockUpdateRequirements).toHaveBeenCalledWith({
          accept_tos: true,
          accept_privacy: true,
          age_verified: true,
        });
      });
    });

    it("should disable signup button when age confirmation is not checked", async () => {
      const user = userEvent.setup();
      renderComponent();

      // Switch to signup mode
      await user.click(screen.getByText("online.switchToSignUpLink"));

      // Enter credentials but don't check age
      const emailInput = screen.getByPlaceholderText("me@example.com");
      const passwordInput = screen.getByLabelText("online.password");

      await user.type(emailInput, "new@example.com");
      await user.type(passwordInput, "password123");

      // Signup button should be disabled without age confirmation
      const signupButton = screen.getByRole("button", {
        name: "online.signUp",
      });
      expect(signupButton).toBeDisabled();

      // Firebase should not be called
      expect(
        mockFirebaseAuth.createUserWithEmailAndPassword,
      ).not.toHaveBeenCalled();
    });

    it("should show error without logging expected signup failure for email already in use", async () => {
      const user = userEvent.setup();
      const { logger } = await import("@/lib/logger");
      mockFirebaseAuth.createUserWithEmailAndPassword.mockRejectedValueOnce(
        new Error("email-already-in-use"),
      );

      renderComponent();

      await user.click(screen.getByText("online.switchToSignUpLink"));

      const emailInput = screen.getByPlaceholderText("me@example.com");
      const passwordInput = screen.getByLabelText("online.password");

      await user.type(emailInput, "existing@example.com");
      await user.type(passwordInput, "password123");

      await user.click(screen.getByRole("checkbox"));
      await user.click(screen.getByRole("button", { name: "online.signUp" }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("online.emailExists");
      });
      expect(logger.error).not.toHaveBeenCalled();
    });

    it("should show error without logging expected signup failure for weak password", async () => {
      const user = userEvent.setup();
      const { logger } = await import("@/lib/logger");
      mockFirebaseAuth.createUserWithEmailAndPassword.mockRejectedValueOnce(
        new Error("weak-password"),
      );

      renderComponent();

      await user.click(screen.getByText("online.switchToSignUpLink"));

      const emailInput = screen.getByPlaceholderText("me@example.com");
      const passwordInput = screen.getByLabelText("online.password");

      await user.type(emailInput, "new@example.com");
      await user.type(passwordInput, "123");

      await user.click(screen.getByRole("checkbox"));
      await user.click(screen.getByRole("button", { name: "online.signUp" }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("online.weakPassword");
      });
      expect(logger.error).not.toHaveBeenCalled();
    });

    it("should submit on Enter key press", async () => {
      const user = userEvent.setup();
      renderComponent();

      const emailInput = screen.getByPlaceholderText("me@example.com");
      const passwordInput = screen.getByLabelText("online.password");

      await user.type(emailInput, "test@example.com");
      await user.type(passwordInput, "password123");

      // Press Enter in password field
      await user.keyboard("{Enter}");

      await waitFor(() => {
        expect(
          mockMfaAuthentication.signInWithEmailAndPassword,
        ).toHaveBeenCalled();
      });
    });
  });

  describe("MFA authentication", () => {
    const startMfaChallenge = async () => {
      const user = userEvent.setup();
      mockMfaAuthentication.signInWithEmailAndPassword.mockResolvedValueOnce({
        mfaRequired: true,
      });
      renderComponent();

      await user.type(
        screen.getByPlaceholderText("me@example.com"),
        "test@example.com",
      );
      await user.type(screen.getByLabelText("online.password"), "password123");
      await user.click(screen.getByRole("button", { name: "online.login" }));

      await screen.findByRole("heading", { name: "online.mfaTitle" });
      return user;
    };

    it("should show TOTP challenge when second factor is required", async () => {
      await startMfaChallenge();

      expect(screen.getByLabelText("online.mfaCode")).toBeInTheDocument();
      expect(
        screen.queryByLabelText("online.password"),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: "online.mfaTitle" }),
      ).toHaveFocus();
    });

    it("should resolve TOTP and finish login", async () => {
      const user = await startMfaChallenge();

      await user.type(screen.getByLabelText("online.mfaCode"), "123456");
      await user.click(
        screen.getByRole("button", { name: "online.mfaVerify" }),
      );

      await waitFor(() => {
        expect(mockMfaAuthentication.resolveTotpSignIn).toHaveBeenCalledWith({
          code: "123456",
        });
      });
      await waitFor(() => {
        expect(mockUpdateRequirements).toHaveBeenCalledWith({
          accept_tos: true,
          accept_privacy: true,
        });
        expect(mockSetLoggedInUser).toHaveBeenCalledWith(
          expect.objectContaining({ uid: "test-uid" }),
        );
      });
    });

    it("should keep MFA visible until account setup finishes", async () => {
      let resolveCurrentUser!: (value: {
        user: {
          email: string;
          uid: string;
          displayName: string;
          emailVerified: boolean;
          providerData: { providerId: string }[];
        };
      }) => void;
      mockFirebaseAuth.getCurrentUser.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveCurrentUser = resolve;
          }),
      );
      const user = await startMfaChallenge();

      await user.type(screen.getByLabelText("online.mfaCode"), "123456");
      await user.click(
        screen.getByRole("button", { name: "online.mfaVerify" }),
      );
      await waitFor(() => {
        expect(mockMfaAuthentication.resolveTotpSignIn).toHaveBeenCalled();
      });

      expect(
        screen.getByRole("heading", { name: "online.mfaTitle" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "online.login" }),
      ).not.toBeInTheDocument();

      await act(async () => {
        resolveCurrentUser({
          user: {
            email: "test@example.com",
            uid: "test-uid",
            displayName: "Test User",
            emailVerified: true,
            providerData: [{ providerId: "password" }],
          },
        });
      });
      await waitFor(() => {
        expect(mockSetLoggedInUser).toHaveBeenCalled();
      });
    });

    it("should show inline error for invalid TOTP", async () => {
      const user = await startMfaChallenge();
      mockMfaAuthentication.resolveTotpSignIn.mockRejectedValueOnce(
        Object.assign(new Error("Invalid code"), {
          code: "auth/invalid-verification-code",
        }),
      );

      await user.type(screen.getByLabelText("online.mfaCode"), "111111");
      await user.click(
        screen.getByRole("button", { name: "online.mfaVerify" }),
      );

      expect(
        await screen.findByText("online.mfaCodeInvalid"),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: "online.mfaTitle" }),
      ).toBeInTheDocument();
    });

    it("should return to login and clear native challenge", async () => {
      const user = await startMfaChallenge();
      mockMfaAuthentication.cancelSignIn.mockClear();

      await user.click(screen.getByRole("button", { name: "online.mfaBack" }));

      await waitFor(() => {
        expect(mockMfaAuthentication.cancelSignIn).toHaveBeenCalledTimes(1);
      });
      expect(
        screen.getByRole("button", { name: "online.login" }),
      ).toBeInTheDocument();
    });

    it("should restart login when TOTP challenge expires", async () => {
      const user = await startMfaChallenge();
      mockMfaAuthentication.resolveTotpSignIn.mockRejectedValueOnce(
        Object.assign(new Error("Expired"), {
          code: "auth/invalid-multi-factor-session",
        }),
      );

      await user.type(screen.getByLabelText("online.mfaCode"), "123456");
      await user.click(
        screen.getByRole("button", { name: "online.mfaVerify" }),
      );

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("online.mfaExpired");
      });
      expect(
        screen.getByRole("button", { name: "online.login" }),
      ).toBeInTheDocument();
    });
  });

  describe("forgot password - logged out", () => {
    it("should send password reset email when email is entered", async () => {
      const user = userEvent.setup();
      renderComponent();

      const emailInput = screen.getByPlaceholderText("me@example.com");
      await user.type(emailInput, "test@example.com");

      await user.click(screen.getByText("online.forgotPassword"));

      await waitFor(() => {
        expect(mockFirebaseAuth.sendPasswordResetEmail).toHaveBeenCalledWith({
          email: "test@example.com",
        });
      });

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith("online.resetEmailSent");
      });
    });

    it("should show error when forgot password clicked without email", async () => {
      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByText("online.forgotPassword"));

      await waitFor(() => {
        expect(screen.getByText("online.enterEmailFirst")).toBeInTheDocument();
      });

      expect(mockFirebaseAuth.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it("should handle forgot password failure", async () => {
      const user = userEvent.setup();
      mockFirebaseAuth.sendPasswordResetEmail.mockRejectedValueOnce(
        new Error("User not found"),
      );

      renderComponent();

      const emailInput = screen.getByPlaceholderText("me@example.com");
      await user.type(emailInput, "notfound@example.com");

      await user.click(screen.getByText("online.forgotPassword"));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("online.resetEmailFailed");
      });
    });
  });

  describe("OAuth authentication", () => {
    it("should login with Google", async () => {
      const user = userEvent.setup();
      mockState.platform = "ios";
      renderComponent();

      await user.click(
        screen.getByRole("button", { name: "online.loginGoogle" }),
      );

      await waitFor(() => {
        expect(mockMfaAuthentication.signInWithGoogle).toHaveBeenCalled();
      });
      await waitFor(() => {
        expect(mockUpdateRequirements).toHaveBeenCalledWith({
          accept_tos: true,
          accept_privacy: true,
        });
      });
    });

    it("should login with Apple", async () => {
      const user = userEvent.setup();
      mockState.platform = "ios";
      renderComponent();

      await user.click(
        screen.getByRole("button", { name: "online.loginApple" }),
      );

      await waitFor(() => {
        expect(mockMfaAuthentication.signInWithApple).toHaveBeenCalled();
      });
      await waitFor(() => {
        expect(mockUpdateRequirements).toHaveBeenCalledWith({
          accept_tos: true,
          accept_privacy: true,
        });
      });
    });

    it("should show MFA challenge after Google login", async () => {
      const user = userEvent.setup();
      mockState.platform = "ios";
      mockMfaAuthentication.signInWithGoogle.mockResolvedValueOnce({
        mfaRequired: true,
      });
      renderComponent();

      await user.click(
        screen.getByRole("button", { name: "online.loginGoogle" }),
      );

      expect(
        await screen.findByRole("heading", { name: "online.mfaTitle" }),
      ).toBeInTheDocument();
      expect(mockUpdateRequirements).not.toHaveBeenCalled();
    });

    it("should show MFA challenge after Apple login", async () => {
      const user = userEvent.setup();
      mockState.platform = "ios";
      mockMfaAuthentication.signInWithApple.mockResolvedValueOnce({
        mfaRequired: true,
      });
      renderComponent();

      await user.click(
        screen.getByRole("button", { name: "online.loginApple" }),
      );

      expect(
        await screen.findByRole("heading", { name: "online.mfaTitle" }),
      ).toBeInTheDocument();
      expect(mockUpdateRequirements).not.toHaveBeenCalled();
    });

    it("should not show error toast when OAuth is cancelled", async () => {
      const user = userEvent.setup();
      mockState.platform = "ios";
      mockMfaAuthentication.signInWithGoogle.mockRejectedValueOnce(
        new Error("popup_closed_by_user"),
      );
      renderComponent();

      await user.click(
        screen.getByRole("button", { name: "online.loginGoogle" }),
      );

      await waitFor(() => {
        expect(mockMfaAuthentication.signInWithGoogle).toHaveBeenCalled();
      });
      expect(toast.error).not.toHaveBeenCalled();
    });

    it("should show error toast on OAuth failure", async () => {
      const user = userEvent.setup();
      mockState.platform = "ios";
      mockMfaAuthentication.signInWithGoogle.mockRejectedValueOnce(
        new Error("Network error"),
      );
      renderComponent();

      await user.click(
        screen.getByRole("button", { name: "online.loginGoogle" }),
      );

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("online.loginFail");
      });
    });

    it("should not show OAuth buttons on web when not on zaparoo.app", () => {
      mockState.platform = "web";
      // Default location is not zaparoo.app

      renderComponent();

      expect(
        screen.queryByRole("button", { name: "online.loginGoogle" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "online.loginApple" }),
      ).not.toBeInTheDocument();
    });

    it("should show Google button first on Android", () => {
      mockState.platform = "android";

      renderComponent();

      const buttons = screen.getAllByRole("button");
      const googleIndex = buttons.findIndex((b) =>
        b.textContent?.includes("online.loginGoogle"),
      );
      const appleIndex = buttons.findIndex((b) =>
        b.textContent?.includes("online.loginApple"),
      );

      expect(googleIndex).toBeLessThan(appleIndex);
    });

    it("should show Apple button first on iOS", () => {
      mockState.platform = "ios";

      renderComponent();

      const buttons = screen.getAllByRole("button");
      const googleIndex = buttons.findIndex((b) =>
        b.textContent?.includes("online.loginGoogle"),
      );
      const appleIndex = buttons.findIndex((b) =>
        b.textContent?.includes("online.loginApple"),
      );

      expect(appleIndex).toBeLessThan(googleIndex);
    });
  });

  describe("account deletion error handling", () => {
    beforeEach(() => {
      mockState.loggedInUser = authenticatedUser({
        email: "test@example.com",
        uid: "test-uid",
        displayName: "Test User",
        emailVerified: true,
        providerData: [{ providerId: "password" }],
      });
    });

    it("should show error for confirmation mismatch", async () => {
      const user = userEvent.setup();
      mockDeleteAccount.mockRejectedValueOnce({
        response: { data: { error: { code: "confirmation_mismatch" } } },
      });

      renderComponent();

      await user.click(
        screen.getByRole("button", { name: "online.deleteAccount" }),
      );

      const confirmInput = screen.getByPlaceholderText("DELETE MY ACCOUNT");
      await user.type(confirmInput, "DELETE MY ACCOUNT");

      const deleteButtons = screen.getAllByRole("button", {
        name: /online.deleteAccount/,
      });
      await user.click(deleteButtons[deleteButtons.length - 1]!);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          "online.deleteConfirmationMismatch",
        );
      });
    });

    it("should show error when developer has active media", async () => {
      const user = userEvent.setup();
      mockDeleteAccount.mockRejectedValueOnce({
        response: { data: { error: { code: "developer_has_active_media" } } },
      });

      renderComponent();

      await user.click(
        screen.getByRole("button", { name: "online.deleteAccount" }),
      );

      const confirmInput = screen.getByPlaceholderText("DELETE MY ACCOUNT");
      await user.type(confirmInput, "DELETE MY ACCOUNT");

      const deleteButtons = screen.getAllByRole("button", {
        name: /online.deleteAccount/,
      });
      await user.click(deleteButtons[deleteButtons.length - 1]!);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("online.deleteHasActiveMedia");
      });
    });

    it("should show error when deletion already scheduled", async () => {
      const user = userEvent.setup();
      mockDeleteAccount.mockRejectedValueOnce({
        response: { data: { error: { code: "deletion_already_scheduled" } } },
      });

      renderComponent();

      await user.click(
        screen.getByRole("button", { name: "online.deleteAccount" }),
      );

      const confirmInput = screen.getByPlaceholderText("DELETE MY ACCOUNT");
      await user.type(confirmInput, "DELETE MY ACCOUNT");

      const deleteButtons = screen.getAllByRole("button", {
        name: /online.deleteAccount/,
      });
      await user.click(deleteButtons[deleteButtons.length - 1]!);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          "online.deletionAlreadyScheduled",
        );
      });
    });

    it("should close modal and show not-signed-in toast when auth is stale during delete", async () => {
      const user = userEvent.setup();
      const { logger } = await import("@/lib/logger");
      mockDeleteAccount.mockRejectedValueOnce(new NotSignedInError());

      renderComponent();

      await user.click(
        screen.getByRole("button", { name: "online.deleteAccount" }),
      );

      const confirmInput = screen.getByPlaceholderText("DELETE MY ACCOUNT");
      await user.type(confirmInput, "DELETE MY ACCOUNT");

      const deleteButtons = screen.getAllByRole("button", {
        name: /online.deleteAccount/,
      });
      await user.click(deleteButtons[deleteButtons.length - 1]!);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("online.notSignedInError");
      });

      await waitFor(() => {
        expect(
          screen.queryByRole("dialog", {
            name: "online.deleteAccountConfirmTitle",
          }),
        ).not.toBeInTheDocument();
      });

      await waitFor(() => {
        expect(logger.error).not.toHaveBeenCalled();
      });
    });
  });

  describe("scheduled deletion cancellation", () => {
    beforeEach(() => {
      mockState.loggedInUser = authenticatedUser({
        email: "test@example.com",
        uid: "test-uid",
        displayName: "Test User",
        emailVerified: true,
        providerData: [{ providerId: "password" }],
      });
    });

    it("should show cancel deletion option when deletion is scheduled", async () => {
      const user = userEvent.setup();
      mockDeleteAccount.mockResolvedValueOnce({
        scheduled_deletion_at: "2024-02-15T00:00:00Z",
      });

      renderComponent();

      // Schedule deletion first
      await user.click(
        screen.getByRole("button", { name: "online.deleteAccount" }),
      );

      const confirmInput = screen.getByPlaceholderText("DELETE MY ACCOUNT");
      await user.type(confirmInput, "DELETE MY ACCOUNT");

      const deleteButtons = screen.getAllByRole("button", {
        name: /online.deleteAccount/,
      });
      await user.click(deleteButtons[deleteButtons.length - 1]!);

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith(
          "online.deleteAccountScheduled",
        );
      });
    });

    it("should show not-signed-in toast without logging error when auth is stale during cancel", async () => {
      const user = userEvent.setup();
      const { logger } = await import("@/lib/logger");

      mockDeleteAccount.mockResolvedValueOnce({
        scheduled_deletion_at: "2024-02-15T00:00:00Z",
      });
      mockCancelAccountDeletion.mockRejectedValueOnce(new NotSignedInError());

      renderComponent();

      await user.click(
        screen.getByRole("button", { name: "online.deleteAccount" }),
      );
      const confirmInput = screen.getByPlaceholderText("DELETE MY ACCOUNT");
      await user.type(confirmInput, "DELETE MY ACCOUNT");
      const deleteButtons = screen.getAllByRole("button", {
        name: /online.deleteAccount/,
      });
      await user.click(deleteButtons[deleteButtons.length - 1]!);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "online.cancelDeletion" }),
        ).toBeInTheDocument();
      });

      await user.click(
        screen.getByRole("button", { name: "online.cancelDeletion" }),
      );

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("online.notSignedInError");
      });

      expect(logger.error).not.toHaveBeenCalled();
    });

    it("should handle cancel deletion failure", async () => {
      const user = userEvent.setup();
      mockCancelAccountDeletion.mockRejectedValueOnce(new Error("Failed"));

      // Set up a user with scheduled deletion
      mockState.loggedInUser = authenticatedUser({
        email: "test@example.com",
        uid: "test-uid",
        displayName: "Test User",
        emailVerified: true,
        providerData: [{ providerId: "password" }],
      });

      // We need to trigger the scheduled deletion state first
      mockDeleteAccount.mockResolvedValueOnce({
        scheduled_deletion_at: "2024-02-15T00:00:00Z",
      });

      renderComponent();

      // Schedule deletion first
      await user.click(
        screen.getByRole("button", { name: "online.deleteAccount" }),
      );

      const confirmInput = screen.getByPlaceholderText("DELETE MY ACCOUNT");
      await user.type(confirmInput, "DELETE MY ACCOUNT");

      const deleteButtons = screen.getAllByRole("button", {
        name: /online.deleteAccount/,
      });
      await user.click(deleteButtons[deleteButtons.length - 1]!);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "online.cancelDeletion" }),
        ).toBeInTheDocument();
      });

      // Now cancel deletion
      await user.click(
        screen.getByRole("button", { name: "online.cancelDeletion" }),
      );

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("online.cancelDeletionFailed");
      });
    });
  });

  describe("requirements update handling", () => {
    it("should continue login even if requirements update fails", async () => {
      const user = userEvent.setup();
      mockUpdateRequirements.mockRejectedValueOnce(new Error("API error"));

      renderComponent();

      const emailInput = screen.getByPlaceholderText("me@example.com");
      const passwordInput = screen.getByLabelText("online.password");

      await user.type(emailInput, "test@example.com");
      await user.type(passwordInput, "password123");

      await user.click(screen.getByRole("button", { name: "online.login" }));

      await waitFor(() => {
        expect(
          mockMfaAuthentication.signInWithEmailAndPassword,
        ).toHaveBeenCalled();
      });

      // Should still set the logged in user even if requirements update fails
      await waitFor(() => {
        expect(mockSetLoggedInUser).toHaveBeenCalled();
      });
    });
  });

  describe("button disabled states", () => {
    it("should disable login button when email is empty", async () => {
      const user = userEvent.setup();
      renderComponent();

      const passwordInput = screen.getByLabelText("online.password");
      await user.type(passwordInput, "password123");

      const loginButton = screen.getByRole("button", { name: "online.login" });
      expect(loginButton).toBeDisabled();
    });

    it("should disable login button when password is empty", async () => {
      const user = userEvent.setup();
      renderComponent();

      const emailInput = screen.getByPlaceholderText("me@example.com");
      await user.type(emailInput, "test@example.com");

      const loginButton = screen.getByRole("button", { name: "online.login" });
      expect(loginButton).toBeDisabled();
    });

    it("should disable signup button when age not confirmed", async () => {
      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByText("online.switchToSignUpLink"));

      const emailInput = screen.getByPlaceholderText("me@example.com");
      const passwordInput = screen.getByLabelText("online.password");

      await user.type(emailInput, "test@example.com");
      await user.type(passwordInput, "password123");

      const signupButton = screen.getByRole("button", {
        name: "online.signUp",
      });
      expect(signupButton).toBeDisabled();
    });

    it("should enable signup button when all fields are filled and age confirmed", async () => {
      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByText("online.switchToSignUpLink"));

      const emailInput = screen.getByPlaceholderText("me@example.com");
      const passwordInput = screen.getByLabelText("online.password");

      await user.type(emailInput, "test@example.com");
      await user.type(passwordInput, "password123");
      await user.click(screen.getByRole("checkbox"));

      const signupButton = screen.getByRole("button", {
        name: "online.signUp",
      });
      expect(signupButton).not.toBeDisabled();
    });
  });

  describe("form interaction behavior", () => {
    it("should enable signup button when age checkbox is checked", async () => {
      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByText("online.switchToSignUpLink"));

      const emailInput = screen.getByPlaceholderText("me@example.com");
      const passwordInput = screen.getByLabelText("online.password");

      await user.type(emailInput, "test@example.com");
      await user.type(passwordInput, "password123");

      // Button should be disabled without age confirmation
      const signupButton = screen.getByRole("button", {
        name: "online.signUp",
      });
      expect(signupButton).toBeDisabled();

      // Now check the age checkbox
      await user.click(screen.getByRole("checkbox"));

      // Button should now be enabled
      expect(signupButton).not.toBeDisabled();
    });

    it("should clear form error when switching modes", async () => {
      const user = userEvent.setup();
      renderComponent();

      // Trigger forgot password error
      await user.click(screen.getByText("online.forgotPassword"));

      expect(screen.getByText("online.enterEmailFirst")).toBeInTheDocument();

      // Switch to signup mode
      await user.click(screen.getByText("online.switchToSignUpLink"));

      // Error should be cleared
      expect(
        screen.queryByText("online.enterEmailFirst"),
      ).not.toBeInTheDocument();
    });
  });
});
