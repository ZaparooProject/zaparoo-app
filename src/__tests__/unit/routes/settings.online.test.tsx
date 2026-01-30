import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "../../../test-utils";
import toast from "react-hot-toast";

// Use vi.hoisted for all variables that need to be accessed in mock factories
const {
  componentRef,
  mockGoBack,
  mockFirebaseAuth,
  mockPurchasesLogOut,
  mockBrowserOpen,
  mockDeleteAccount,
  mockCancelAccountDeletion,
  mockUpdateRequirements,
  mockSetLoggedInUser,
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
  },
  mockPurchasesLogOut: vi.fn(),
  mockBrowserOpen: vi.fn(),
  mockDeleteAccount: vi.fn(),
  mockCancelAccountDeletion: vi.fn(),
  mockUpdateRequirements: vi.fn(),
  mockSetLoggedInUser: vi.fn(),
  mockState: { loggedInUser: null as any, platform: "web" as string },
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    createFileRoute: () => (options: any) => {
      componentRef.current = options.component;
      return { options };
    },
    useRouter: () => ({ history: { back: mockGoBack } }),
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

// Mock RevenueCat
vi.mock("@revenuecat/purchases-capacitor", () => ({
  Purchases: {
    logOut: () => mockPurchasesLogOut(),
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

// Mock onlineApi
vi.mock("@/lib/onlineApi", () => ({
  updateRequirements: (...args: unknown[]) => mockUpdateRequirements(...args),
  deleteAccount: (...args: unknown[]) => mockDeleteAccount(...args),
  cancelAccountDeletion: () => mockCancelAccountDeletion(),
}));

// Mock store
vi.mock("@/lib/store", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    useStatusStore: (selector: any) =>
      selector({
        loggedInUser: mockState.loggedInUser,
        setLoggedInUser: mockSetLoggedInUser,
        safeInsets: { top: "0px", bottom: "0px", left: "0px", right: "0px" },
      }),
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
  logger: { error: vi.fn() },
}));

// Import the route module to trigger createFileRoute which captures the component
import "@/routes/settings.online";

// The component will be captured by the mock
const getOnline = () => componentRef.current;

describe("Settings Online Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.platform = "web";
    mockState.loggedInUser = null;

    // Reset Firebase mocks with default implementations
    mockFirebaseAuth.signOut.mockResolvedValue(undefined);
    mockFirebaseAuth.signInWithEmailAndPassword.mockResolvedValue({
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
  });

  describe("rendering - logged in state", () => {
    beforeEach(() => {
      mockState.loggedInUser = {
        email: "loggedin@example.com",
        uid: "logged-in-uid",
        displayName: "Logged In User",
        emailVerified: true,
        providerData: [{ providerId: "password" }],
      };
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
      mockState.loggedInUser = {
        ...mockState.loggedInUser,
        providerData: [{ providerId: "google.com" }],
      };
      renderComponent();
      expect(
        screen.queryByRole("button", { name: "online.changePassword" }),
      ).not.toBeInTheDocument();
    });

    it("should show email verified indicator for verified password users", () => {
      renderComponent();
      expect(screen.getByText("online.emailVerified")).toBeInTheDocument();
    });

    it("should show email not verified indicator with resend button for unverified users", () => {
      mockState.loggedInUser = {
        ...mockState.loggedInUser,
        emailVerified: false,
      };
      renderComponent();
      expect(screen.getByText("online.emailNotVerified")).toBeInTheDocument();
      expect(screen.getByText("online.resendVerification")).toBeInTheDocument();
    });

    it("should show Google login indicator for Google users", () => {
      mockState.loggedInUser = {
        ...mockState.loggedInUser,
        providerData: [{ providerId: "google.com" }],
      };
      renderComponent();
      expect(screen.getByText("online.loggedInWithGoogle")).toBeInTheDocument();
    });

    it("should show Apple login indicator for Apple users", () => {
      mockState.loggedInUser = {
        ...mockState.loggedInUser,
        providerData: [{ providerId: "apple.com" }],
      };
      renderComponent();
      expect(screen.getByText("online.loggedInWithApple")).toBeInTheDocument();
    });

    it("should show user initial when no profile photo", () => {
      renderComponent();
      // First letter of display name "Logged In User" = "L"
      expect(screen.getByText("L")).toBeInTheDocument();
    });
  });

  describe("mode toggle", () => {
    it("should switch to signup mode when clicking signup link", () => {
      renderComponent();

      fireEvent.click(screen.getByText("online.switchToSignUpLink"));

      // Should now show signup button
      expect(
        screen.getByRole("button", { name: "online.signUp" }),
      ).toBeInTheDocument();
      // Should show age confirmation checkbox
      expect(screen.getByText("online.ageConfirmLabel")).toBeInTheDocument();
      // Should show switch to login link
      expect(screen.getByText("online.switchToLogInLink")).toBeInTheDocument();
    });

    it("should switch back to login mode", () => {
      renderComponent();

      // Switch to signup
      fireEvent.click(screen.getByText("online.switchToSignUpLink"));
      // Switch back to login
      fireEvent.click(screen.getByText("online.switchToLogInLink"));

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
      mockState.loggedInUser = {
        email: "test@example.com",
        uid: "test-uid",
        displayName: "Test User",
        emailVerified: true,
        providerData: [{ providerId: "password" }],
      };
    });

    it("should call Firebase signOut and clear user state on logout", async () => {
      renderComponent();

      fireEvent.click(screen.getByRole("button", { name: "online.logout" }));

      await waitFor(() => {
        expect(mockFirebaseAuth.signOut).toHaveBeenCalled();
      });
    });

    it("should call RevenueCat logout before Firebase signOut on native platform", async () => {
      mockState.platform = "ios";
      renderComponent();

      fireEvent.click(screen.getByRole("button", { name: "online.logout" }));

      await waitFor(() => {
        expect(mockPurchasesLogOut).toHaveBeenCalled();
        expect(mockFirebaseAuth.signOut).toHaveBeenCalled();
      });
    });

    it("should skip RevenueCat logout on web platform", async () => {
      mockState.platform = "web";
      renderComponent();

      fireEvent.click(screen.getByRole("button", { name: "online.logout" }));

      await waitFor(() => {
        expect(mockFirebaseAuth.signOut).toHaveBeenCalled();
      });

      expect(mockPurchasesLogOut).not.toHaveBeenCalled();
    });
  });

  describe("external links", () => {
    beforeEach(() => {
      mockState.loggedInUser = {
        email: "test@example.com",
        uid: "test-uid",
        displayName: "Test User",
        emailVerified: true,
        providerData: [{ providerId: "password" }],
      };
    });

    it("should open dashboard when button clicked", () => {
      renderComponent();

      fireEvent.click(screen.getByRole("button", { name: "online.dashboard" }));

      expect(mockBrowserOpen).toHaveBeenCalledWith({
        url: "https://online.zaparoo.com",
      });
    });
  });

  describe("password reset", () => {
    beforeEach(() => {
      mockState.loggedInUser = {
        email: "test@example.com",
        uid: "test-uid",
        displayName: "Test User",
        emailVerified: true,
        providerData: [{ providerId: "password" }],
      };
    });

    it("should send password reset email when change password clicked", async () => {
      renderComponent();

      fireEvent.click(
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
      mockFirebaseAuth.sendPasswordResetEmail.mockRejectedValueOnce(
        new Error("Failed"),
      );

      renderComponent();

      fireEvent.click(
        screen.getByRole("button", { name: "online.changePassword" }),
      );

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("online.resetEmailFailed");
      });
    });
  });

  describe("email verification", () => {
    beforeEach(() => {
      mockState.loggedInUser = {
        email: "test@example.com",
        uid: "test-uid",
        displayName: "Test User",
        emailVerified: false,
        providerData: [{ providerId: "password" }],
      };
    });

    it("should send verification email when resend clicked", async () => {
      renderComponent();

      fireEvent.click(screen.getByText("online.resendVerification"));

      await waitFor(() => {
        expect(mockFirebaseAuth.sendEmailVerification).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith("online.verificationSent");
      });
    });

    it("should handle verification email failure", async () => {
      mockFirebaseAuth.sendEmailVerification.mockRejectedValueOnce(
        new Error("Failed"),
      );

      renderComponent();

      fireEvent.click(screen.getByText("online.resendVerification"));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("online.verificationFailed");
      });
    });
  });

  describe("account deletion", () => {
    beforeEach(() => {
      mockState.loggedInUser = {
        email: "test@example.com",
        uid: "test-uid",
        displayName: "Test User",
        emailVerified: true,
        providerData: [{ providerId: "password" }],
      };
    });

    it("should open delete confirmation dialog", () => {
      renderComponent();

      fireEvent.click(
        screen.getByRole("button", { name: "online.deleteAccount" }),
      );

      expect(
        screen.getByText("online.deleteAccountConfirmTitle"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("online.deleteAccountConfirmMessage"),
      ).toBeInTheDocument();
    });

    it("should disable delete button until confirmation text matches", () => {
      renderComponent();

      fireEvent.click(
        screen.getByRole("button", { name: "online.deleteAccount" }),
      );

      const confirmInput = screen.getByPlaceholderText("DELETE MY ACCOUNT");
      const deleteButtons = screen.getAllByRole("button", {
        name: /online.deleteAccount/,
      });
      const confirmDeleteButton = deleteButtons[deleteButtons.length - 1];

      expect(confirmDeleteButton).toBeDisabled();

      fireEvent.change(confirmInput, {
        target: { value: "DELETE MY ACCOUNT" },
      });

      expect(confirmDeleteButton).not.toBeDisabled();
    });

    it("should call deleteAccount API when confirmed", async () => {
      renderComponent();

      fireEvent.click(
        screen.getByRole("button", { name: "online.deleteAccount" }),
      );

      const confirmInput = screen.getByPlaceholderText("DELETE MY ACCOUNT");
      fireEvent.change(confirmInput, {
        target: { value: "DELETE MY ACCOUNT" },
      });

      const deleteButtons = screen.getAllByRole("button", {
        name: /online.deleteAccount/,
      });
      const confirmDeleteButton = deleteButtons[deleteButtons.length - 1];
      fireEvent.click(confirmDeleteButton);

      await waitFor(() => {
        expect(mockDeleteAccount).toHaveBeenCalledWith("DELETE MY ACCOUNT");
      });
    });

    it("should close dialog on cancel", () => {
      renderComponent();

      fireEvent.click(
        screen.getByRole("button", { name: "online.deleteAccount" }),
      );

      expect(
        screen.getByText("online.deleteAccountConfirmTitle"),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "nav.cancel" }));

      expect(
        screen.queryByText("online.deleteAccountConfirmTitle"),
      ).not.toBeInTheDocument();
    });
  });

  describe("navigation", () => {
    it("should navigate back when back button clicked", () => {
      renderComponent();

      fireEvent.click(screen.getByLabelText("nav.back"));

      expect(mockGoBack).toHaveBeenCalled();
    });
  });
});
