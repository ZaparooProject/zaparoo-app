import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "../../../test-utils";
import userEvent from "@testing-library/user-event";
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
      mockState.loggedInUser = {
        email: "test@example.com",
        uid: "test-uid",
        displayName: "Test User",
        emailVerified: true,
        providerData: [{ providerId: "password" }],
      };
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
      mockState.loggedInUser = {
        email: "test@example.com",
        uid: "test-uid",
        displayName: "Test User",
        emailVerified: true,
        providerData: [{ providerId: "password" }],
      };
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
      mockState.loggedInUser = {
        email: "test@example.com",
        uid: "test-uid",
        displayName: "Test User",
        emailVerified: true,
        providerData: [{ providerId: "password" }],
      };
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
      mockState.loggedInUser = {
        email: "test@example.com",
        uid: "test-uid",
        displayName: "Test User",
        emailVerified: true,
        providerData: [{ providerId: "password" }],
      };
    });

    it("should open delete confirmation dialog", async () => {
      const user = userEvent.setup();
      renderComponent();

      await user.click(
        screen.getByRole("button", { name: "online.deleteAccount" }),
      );

      expect(
        screen.getByText("online.deleteAccountConfirmTitle"),
      ).toBeInTheDocument();
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
        screen.queryByText("online.deleteAccountConfirmTitle"),
      ).not.toBeInTheDocument();
    });
  });

  describe("navigation", () => {
    it("should navigate back when back button clicked", async () => {
      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByLabelText("nav.back"));

      expect(mockGoBack).toHaveBeenCalled();
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
          mockFirebaseAuth.signInWithEmailAndPassword,
        ).toHaveBeenCalledWith({
          email: "test@example.com",
          password: "password123",
        });
      });
    });

    it("should show error toast on login failure", async () => {
      const user = userEvent.setup();
      mockFirebaseAuth.signInWithEmailAndPassword.mockRejectedValueOnce(
        new Error("Invalid credentials"),
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

    it("should show error on signup failure for email already in use", async () => {
      const user = userEvent.setup();
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
    });

    it("should show error on signup failure for weak password", async () => {
      const user = userEvent.setup();
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
        expect(mockFirebaseAuth.signInWithEmailAndPassword).toHaveBeenCalled();
      });
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
      mockFirebaseAuth.signInWithGoogle.mockResolvedValueOnce({
        user: {
          email: "google@example.com",
          uid: "google-uid",
          displayName: "Google User",
          emailVerified: true,
          providerData: [{ providerId: "google.com" }],
        },
      });
      mockUpdateRequirements.mockResolvedValueOnce({});

      renderComponent();

      await user.click(
        screen.getByRole("button", { name: "online.loginGoogle" }),
      );

      await waitFor(() => {
        expect(mockFirebaseAuth.signInWithGoogle).toHaveBeenCalled();
      });
    });

    it("should login with Apple", async () => {
      const user = userEvent.setup();
      mockState.platform = "ios";
      mockFirebaseAuth.signInWithApple.mockResolvedValueOnce({
        user: {
          email: "apple@example.com",
          uid: "apple-uid",
          displayName: "Apple User",
          emailVerified: true,
          providerData: [{ providerId: "apple.com" }],
        },
      });
      mockUpdateRequirements.mockResolvedValueOnce({});

      renderComponent();

      await user.click(
        screen.getByRole("button", { name: "online.loginApple" }),
      );

      await waitFor(() => {
        expect(mockFirebaseAuth.signInWithApple).toHaveBeenCalled();
      });
    });

    it("should not show error toast when OAuth is cancelled", async () => {
      const user = userEvent.setup();
      mockState.platform = "ios";
      mockFirebaseAuth.signInWithGoogle.mockRejectedValueOnce(
        new Error("popup_closed_by_user"),
      );

      renderComponent();

      await user.click(
        screen.getByRole("button", { name: "online.loginGoogle" }),
      );

      await waitFor(() => {
        expect(mockFirebaseAuth.signInWithGoogle).toHaveBeenCalled();
      });

      // Should not show error toast for cancelled login
      expect(toast.error).not.toHaveBeenCalled();
    });

    it("should show error toast on OAuth failure", async () => {
      const user = userEvent.setup();
      mockState.platform = "ios";
      mockFirebaseAuth.signInWithGoogle.mockRejectedValueOnce(
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
      mockState.loggedInUser = {
        email: "test@example.com",
        uid: "test-uid",
        displayName: "Test User",
        emailVerified: true,
        providerData: [{ providerId: "password" }],
      };
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
  });

  describe("scheduled deletion cancellation", () => {
    beforeEach(() => {
      mockState.loggedInUser = {
        email: "test@example.com",
        uid: "test-uid",
        displayName: "Test User",
        emailVerified: true,
        providerData: [{ providerId: "password" }],
      };
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

    it("should handle cancel deletion failure", async () => {
      const user = userEvent.setup();
      mockCancelAccountDeletion.mockRejectedValueOnce(new Error("Failed"));

      // Set up a user with scheduled deletion
      mockState.loggedInUser = {
        email: "test@example.com",
        uid: "test-uid",
        displayName: "Test User",
        emailVerified: true,
        providerData: [{ providerId: "password" }],
      };

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

  describe("user avatar display", () => {
    it("should display profile photo when available", () => {
      mockState.loggedInUser = {
        email: "test@example.com",
        uid: "test-uid",
        displayName: "Test User",
        emailVerified: true,
        photoUrl: "https://example.com/photo.jpg",
        providerData: [{ providerId: "google.com" }],
      };

      const { container } = renderComponent();

      // The avatar img has alt="" which makes it decorative, so we find it by src attribute
      const avatar = container.querySelector(
        'img[src="https://example.com/photo.jpg"]',
      );
      expect(avatar).toBeInTheDocument();
    });

    it("should display initial from email when no display name", () => {
      mockState.loggedInUser = {
        email: "test@example.com",
        uid: "test-uid",
        displayName: null,
        emailVerified: true,
        providerData: [{ providerId: "password" }],
      };

      renderComponent();

      // First letter of email "test@example.com" = "T"
      expect(screen.getByText("T")).toBeInTheDocument();
    });

    it("should display question mark when no name or email", () => {
      mockState.loggedInUser = {
        email: null,
        uid: "test-uid",
        displayName: null,
        emailVerified: false,
        providerData: [],
      };

      renderComponent();

      expect(screen.getByText("?")).toBeInTheDocument();
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
        expect(mockFirebaseAuth.signInWithEmailAndPassword).toHaveBeenCalled();
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
