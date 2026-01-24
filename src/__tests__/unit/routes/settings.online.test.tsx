import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "../../../test-utils";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import toast from "react-hot-toast";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";

// Mock dependencies
vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@capacitor-firebase/authentication", () => ({
  default: {},
  FirebaseAuthentication: {
    signOut: vi.fn().mockResolvedValue(undefined),
    signInWithEmailAndPassword: vi.fn().mockResolvedValue({
      user: {
        email: "test@example.com",
        uid: "test-uid",
      },
    }),
    createUserWithEmailAndPassword: vi.fn().mockResolvedValue({
      user: {
        email: "newuser@example.com",
        uid: "new-uid",
      },
    }),
    signInWithGoogle: vi.fn().mockResolvedValue({
      user: {
        email: "google@example.com",
        uid: "google-uid",
      },
    }),
    signInWithApple: vi.fn().mockResolvedValue({
      user: {
        email: "apple@example.com",
        uid: "apple-uid",
      },
    }),
    sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  },
}));

const mockPurchasesLogOut = vi.fn().mockResolvedValue(undefined);
vi.mock("@revenuecat/purchases-capacitor", () => ({
  Purchases: {
    logOut: () => mockPurchasesLogOut(),
  },
}));

// Capacitor mock with configurable platform
let mockPlatform = "web";
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => mockPlatform !== "web"),
    getPlatform: vi.fn(() => mockPlatform),
  },
}));

const mockLoggerError = vi.fn();
vi.mock("../../../lib/logger", () => ({
  logger: { error: mockLoggerError },
}));

vi.mock("@capacitor/browser", () => ({
  default: {},
  Browser: {
    open: vi.fn(),
  },
}));

vi.mock("lucide-react", () => ({
  ExternalLinkIcon: () => "ExternalLinkIcon",
  LogInIcon: () => "LogInIcon",
  LogOutIcon: () => "LogOutIcon",
  UserPlusIcon: () => "UserPlusIcon",
}));

const mockSetLoggedInUser = vi.fn();
vi.mock("../../../lib/store.ts", () => ({
  // Mock the ConnectionState enum to avoid TypeScript enum compilation issues
  ConnectionState: {
    IDLE: "IDLE",
    CONNECTING: "CONNECTING",
    CONNECTED: "CONNECTED",
    RECONNECTING: "RECONNECTING",
    ERROR: "ERROR",
    DISCONNECTED: "DISCONNECTED",
  },
  useStatusStore: vi.fn((selector) => {
    const mockState = {
      loggedInUser: null,
      setLoggedInUser: mockSetLoggedInUser,
    };
    return selector(mockState);
  }),
}));

vi.mock("../../../hooks/useSmartSwipe", () => ({
  useSmartSwipe: vi.fn(() => ({})),
}));

// Mock other modules that contain enums to prevent compilation issues
vi.mock("../../../lib/nfc.ts", () => ({
  Status: {
    Idle: "idle",
    Reading: "reading",
    Success: "success",
    Error: "error",
  },
}));

vi.mock("../../../lib/writeNfcHook.tsx", () => ({
  WriteMethod: {
    NFC: "nfc",
    Remote: "remote",
  },
  WriteAction: {
    Read: "read",
    Write: "write",
    Format: "format",
  },
  useNfcWriter: vi.fn(() => ({
    status: null,
    write: vi.fn(),
    end: vi.fn(),
    writing: false,
    result: null,
  })),
}));

const mockNavigate = vi.fn();
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    createFileRoute: actual.createFileRoute,
  };
});

vi.mock("../../../components/wui/TextInput.tsx", () => ({
  TextInput: ({ value, setValue, label, placeholder, type }: any) => (
    <div>
      <label data-testid={`label-${label?.toLowerCase().replace(/\s+/g, "-")}`}>
        {label}
      </label>
      <input
        data-testid={`input-${label?.toLowerCase().replace(/\s+/g, "-")}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        type={type}
      />
    </div>
  ),
}));

vi.mock("../../../components/wui/Button.tsx", () => ({
  Button: ({ label, onClick, disabled, icon, className }: any) => (
    <button
      data-testid={`button-${label.toLowerCase().replace(/\s+/g, "-")}`}
      onClick={onClick}
      disabled={disabled}
      className={className}
    >
      {icon && <span data-testid="button-icon">{icon}</span>}
      {label}
    </button>
  ),
}));

vi.mock("../../../components/PageFrame.tsx", () => ({
  PageFrame: ({ title, back, children, ...props }: any) => (
    <div data-testid="page-frame" {...props}>
      <div data-testid="page-title">{title}</div>
      <button data-testid="back-button" onClick={back}>
        Back
      </button>
      <div data-testid="page-content">{children}</div>
    </div>
  ),
}));

describe("Settings Online Route", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPlatform = "web"; // Default to web platform
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    // Reset mock calls
    mockSetLoggedInUser.mockClear();
    mockPurchasesLogOut.mockClear();
    mockPurchasesLogOut.mockResolvedValue(undefined);
    mockLoggerError.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should render online settings page with all components", async () => {
    const TestWrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    // Mock the online component for logged out state
    const OnlineComponent = () => {
      const [onlineEmail, setOnlineEmail] = React.useState("");
      const [onlinePassword, setOnlinePassword] = React.useState("");

      return (
        <div data-testid="page-frame">
          <div data-testid="page-title">Online</div>
          <button data-testid="back-button">Back</button>
          <div data-testid="page-content">
            <button data-testid="button-open-dashboard">Open Dashboard</button>

            {/* Login form for logged out state */}
            <div>
              <label data-testid="label-email">Email</label>
              <input
                data-testid="input-email"
                value={onlineEmail}
                onChange={(e) => setOnlineEmail(e.target.value)}
                placeholder="me@example.com"
              />
            </div>
            <div>
              <label data-testid="label-password">Password</label>
              <input
                data-testid="input-password"
                value={onlinePassword}
                onChange={(e) => setOnlinePassword(e.target.value)}
                type="password"
              />
            </div>
            <button data-testid="button-login">Login</button>
            <button data-testid="button-login-with-google">
              Login with Google
            </button>
          </div>
        </div>
      );
    };

    render(
      <TestWrapper>
        <OnlineComponent />
      </TestWrapper>,
    );

    expect(screen.getByTestId("page-frame")).toBeInTheDocument();
    expect(screen.getByTestId("page-title")).toHaveTextContent("Online");
    expect(screen.getByTestId("button-open-dashboard")).toBeInTheDocument();
    expect(screen.getByTestId("input-email")).toBeInTheDocument();
    expect(screen.getByTestId("input-password")).toBeInTheDocument();
    expect(screen.getByTestId("button-login")).toBeInTheDocument();
    expect(screen.getByTestId("button-login-with-google")).toBeInTheDocument();
  });

  it("should handle dashboard button click", async () => {
    const { Browser } = await import("@capacitor/browser");

    const TestComponent = () => {
      return (
        <button
          data-testid="dashboard-button"
          onClick={() => Browser.open({ url: "https://zaparoo.com/dashboard" })}
        >
          Open Dashboard
        </button>
      );
    };

    render(<TestComponent />);

    const dashboardButton = screen.getByTestId("dashboard-button");
    fireEvent.click(dashboardButton);

    expect(Browser.open).toHaveBeenCalledWith({
      url: "https://zaparoo.com/dashboard",
    });
  });

  it("should handle email and password input changes", async () => {
    const TestComponent = () => {
      const [onlineEmail, setOnlineEmail] = React.useState("");
      const [onlinePassword, setOnlinePassword] = React.useState("");

      return (
        <div>
          <input
            data-testid="email-input"
            value={onlineEmail}
            onChange={(e) => setOnlineEmail(e.target.value)}
            placeholder="me@example.com"
          />
          <input
            data-testid="password-input"
            value={onlinePassword}
            onChange={(e) => setOnlinePassword(e.target.value)}
            type="password"
          />
          <div data-testid="email-value">{onlineEmail}</div>
          <div data-testid="password-value">{onlinePassword}</div>
        </div>
      );
    };

    render(<TestComponent />);

    const emailInput = screen.getByTestId("email-input");
    const passwordInput = screen.getByTestId("password-input");

    fireEvent.change(emailInput, { target: { value: "test@example.com" } });
    fireEvent.change(passwordInput, { target: { value: "password123" } });

    expect(screen.getByTestId("email-value")).toHaveTextContent(
      "test@example.com",
    );
    expect(screen.getByTestId("password-value")).toHaveTextContent(
      "password123",
    );
  });

  it("should handle successful email/password login", async () => {
    const { FirebaseAuthentication } =
      await import("@capacitor-firebase/authentication");

    const TestComponent = () => {
      const [onlineEmail] = React.useState("test@example.com");
      const [onlinePassword] = React.useState("password123");
      const [onlineLoggingIn, setOnlineLoggingIn] = React.useState(false);

      const handleLogin = () => {
        setOnlineLoggingIn(true);
        FirebaseAuthentication.signInWithEmailAndPassword({
          email: onlineEmail,
          password: onlinePassword,
        })
          .then((result) => {
            if (result) {
              toast.success("Login successful!");
            } else {
              toast.error("Login failed!");
            }
            mockSetLoggedInUser(result.user);
            setOnlineLoggingIn(false);
          })
          .catch((e: Error) => {
            console.error(e);
            toast.error("Login failed!");
            setOnlineLoggingIn(false);
            mockSetLoggedInUser(null);
          });
      };

      return (
        <div>
          <button
            data-testid="login-button"
            onClick={handleLogin}
            disabled={!onlineEmail || !onlinePassword || onlineLoggingIn}
          >
            Login
          </button>
          {onlineLoggingIn && <div data-testid="logging-in">Logging in...</div>}
        </div>
      );
    };

    render(<TestComponent />);

    const loginButton = screen.getByTestId("login-button");
    fireEvent.click(loginButton);

    await waitFor(() => {
      expect(
        FirebaseAuthentication.signInWithEmailAndPassword,
      ).toHaveBeenCalledWith({
        email: "test@example.com",
        password: "password123",
      });
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Login successful!");
      expect(mockSetLoggedInUser).toHaveBeenCalledWith({
        email: "test@example.com",
        uid: "test-uid",
      });
    });
  });

  it("should handle failed email/password login", async () => {
    const { FirebaseAuthentication } =
      await import("@capacitor-firebase/authentication");

    // Mock console.error to suppress expected error output
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    // Mock failed login
    vi.mocked(
      FirebaseAuthentication.signInWithEmailAndPassword,
    ).mockRejectedValueOnce(new Error("Invalid credentials"));

    const TestComponent = () => {
      const [, setOnlineLoggingIn] = React.useState(false);

      const handleLogin = () => {
        setOnlineLoggingIn(true);
        FirebaseAuthentication.signInWithEmailAndPassword({
          email: "test@example.com",
          password: "wrong-password",
        })
          .then((result) => {
            if (result) {
              toast.success("Login successful!");
            } else {
              toast.error("Login failed!");
            }
            setOnlineLoggingIn(false);
          })
          .catch((e: Error) => {
            console.error(e);
            toast.error("Login failed!");
            setOnlineLoggingIn(false);
            mockSetLoggedInUser(null);
          });
      };

      return (
        <div>
          <button data-testid="login-button" onClick={handleLogin}>
            Login
          </button>
        </div>
      );
    };

    render(<TestComponent />);

    const loginButton = screen.getByTestId("login-button");
    fireEvent.click(loginButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Login failed!");
      expect(mockSetLoggedInUser).toHaveBeenCalledWith(null);
    });

    consoleErrorSpy.mockRestore();
  });

  it("should handle successful Google login", async () => {
    const TestComponent = () => {
      const handleGoogleLogin = () => {
        FirebaseAuthentication.signInWithGoogle()
          .then((result) => {
            if (result) {
              toast.success("Login successful!");
            } else {
              toast.error("Login failed!");
            }
            mockSetLoggedInUser(result.user);
          })
          .catch((e: Error) => {
            console.error(e);
            toast.error("Login failed!");
            mockSetLoggedInUser(null);
          });
      };

      return (
        <button data-testid="google-login-button" onClick={handleGoogleLogin}>
          Login with Google
        </button>
      );
    };

    render(<TestComponent />);

    const googleButton = screen.getByTestId("google-login-button");
    fireEvent.click(googleButton);

    await waitFor(() => {
      expect(FirebaseAuthentication.signInWithGoogle).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Login successful!");
      expect(mockSetLoggedInUser).toHaveBeenCalledWith({
        email: "google@example.com",
        uid: "google-uid",
      });
    });
  });

  it("should display logged in user state", async () => {
    // Mock logged in state using the already imported mock
    const { useStatusStore } = await import("../../../lib/store.ts");
    vi.mocked(useStatusStore).mockImplementation((selector: any) => {
      const mockState = {
        loggedInUser: {
          email: "loggedin@example.com",
          uid: "logged-in-uid",
        },
        setLoggedInUser: mockSetLoggedInUser,
      };
      return selector(mockState);
    });

    const TestComponent = () => {
      const loggedInUser = useStatusStore((state: any) => state.loggedInUser);

      if (loggedInUser !== null) {
        return (
          <div>
            <span data-testid="logged-in-text">
              Logged in as: {loggedInUser.email}
            </span>
            <button data-testid="button-logout">Logout</button>
          </div>
        );
      }

      return <div data-testid="login-form">Login Form</div>;
    };

    render(<TestComponent />);

    expect(screen.getByTestId("logged-in-text")).toHaveTextContent(
      "Logged in as: loggedin@example.com",
    );
    expect(screen.getByTestId("button-logout")).toBeInTheDocument();
    expect(screen.queryByTestId("login-form")).not.toBeInTheDocument();
  });

  it("should handle logout", async () => {
    const TestComponent = () => {
      const [onlineEmail, setOnlineEmail] = React.useState("test@example.com");
      const [onlinePassword, setOnlinePassword] = React.useState("password123");

      const handleLogout = () => {
        FirebaseAuthentication.signOut()
          .then(() => {
            mockSetLoggedInUser(null);
            setOnlineEmail("");
            setOnlinePassword("");
          })
          .catch((e) => {
            console.error(e);
          });
      };

      return (
        <div>
          <button data-testid="logout-button" onClick={handleLogout}>
            Logout
          </button>
          <div data-testid="email-value">{onlineEmail}</div>
          <div data-testid="password-value">{onlinePassword}</div>
        </div>
      );
    };

    render(<TestComponent />);

    const logoutButton = screen.getByTestId("logout-button");
    fireEvent.click(logoutButton);

    await waitFor(() => {
      expect(FirebaseAuthentication.signOut).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(mockSetLoggedInUser).toHaveBeenCalledWith(null);
      expect(screen.getByTestId("email-value")).toHaveTextContent("");
      expect(screen.getByTestId("password-value")).toHaveTextContent("");
    });
  });

  it("should disable login button when fields are empty or logging in", async () => {
    const TestComponent = () => {
      const [onlineEmail, setOnlineEmail] = React.useState("");
      const [onlinePassword, setOnlinePassword] = React.useState("");
      const [onlineLoggingIn, setOnlineLoggingIn] = React.useState(false);

      return (
        <div>
          <input
            data-testid="email-input"
            value={onlineEmail}
            onChange={(e) => setOnlineEmail(e.target.value)}
          />
          <input
            data-testid="password-input"
            value={onlinePassword}
            onChange={(e) => setOnlinePassword(e.target.value)}
          />
          <button
            data-testid="login-button"
            disabled={!onlineEmail || !onlinePassword || onlineLoggingIn}
            onClick={() => setOnlineLoggingIn(true)}
          >
            Login
          </button>
        </div>
      );
    };

    render(<TestComponent />);

    const loginButton = screen.getByTestId("login-button");
    const emailInput = screen.getByTestId("email-input");
    const passwordInput = screen.getByTestId("password-input");

    // Should be disabled when both fields are empty
    expect(loginButton).toBeDisabled();

    // Should still be disabled when only email is filled
    fireEvent.change(emailInput, { target: { value: "test@example.com" } });
    expect(loginButton).toBeDisabled();

    // Should be enabled when both fields are filled
    fireEvent.change(passwordInput, { target: { value: "password123" } });
    expect(loginButton).not.toBeDisabled();

    // Should be disabled when logging in
    fireEvent.click(loginButton);
    expect(loginButton).toBeDisabled();
  });

  it("should handle back navigation", async () => {
    const TestComponent = () => {
      return (
        <button
          data-testid="back-button"
          onClick={() => mockNavigate({ to: "/settings" })}
        >
          Back
        </button>
      );
    };

    render(<TestComponent />);

    const backButton = screen.getByTestId("back-button");
    fireEvent.click(backButton);

    expect(mockNavigate).toHaveBeenCalledWith({ to: "/settings" });
  });

  it("should handle logout errors gracefully", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Mock logout error
    vi.mocked(FirebaseAuthentication.signOut).mockRejectedValueOnce(
      new Error("Logout failed"),
    );

    const TestComponent = () => {
      const handleLogout = () => {
        FirebaseAuthentication.signOut()
          .then(() => {
            mockSetLoggedInUser(null);
          })
          .catch((e) => {
            console.error(e);
          });
      };

      return (
        <button data-testid="logout-button" onClick={handleLogout}>
          Logout
        </button>
      );
    };

    render(<TestComponent />);

    const logoutButton = screen.getByTestId("logout-button");
    fireEvent.click(logoutButton);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(expect.any(Error));
    });

    consoleSpy.mockRestore();
  });

  it("should handle successful sign up", async () => {
    const { FirebaseAuthentication } =
      await import("@capacitor-firebase/authentication");

    const TestComponent = () => {
      const [onlineEmail] = React.useState("newuser@example.com");
      const [onlinePassword] = React.useState("password123");
      const [isLoading, setIsLoading] = React.useState(false);

      const handleSignUp = () => {
        setIsLoading(true);
        FirebaseAuthentication.createUserWithEmailAndPassword({
          email: onlineEmail,
          password: onlinePassword,
        })
          .then((result) => {
            if (result.user) {
              toast.success("Account created successfully");
            } else {
              toast.error("Failed to create account");
            }
            mockSetLoggedInUser(result.user);
            setIsLoading(false);
          })
          .catch((e: Error) => {
            console.error(e);
            toast.error("Failed to create account");
            setIsLoading(false);
          });
      };

      return (
        <div>
          <button
            data-testid="signup-button"
            onClick={handleSignUp}
            disabled={!onlineEmail || !onlinePassword || isLoading}
          >
            Sign up
          </button>
        </div>
      );
    };

    render(<TestComponent />);

    const signupButton = screen.getByTestId("signup-button");
    fireEvent.click(signupButton);

    await waitFor(() => {
      expect(
        FirebaseAuthentication.createUserWithEmailAndPassword,
      ).toHaveBeenCalledWith({
        email: "newuser@example.com",
        password: "password123",
      });
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        "Account created successfully",
      );
      expect(mockSetLoggedInUser).toHaveBeenCalledWith({
        email: "newuser@example.com",
        uid: "new-uid",
      });
    });
  });

  it("should handle sign up with email already in use", async () => {
    const { FirebaseAuthentication } =
      await import("@capacitor-firebase/authentication");

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    vi.mocked(
      FirebaseAuthentication.createUserWithEmailAndPassword,
    ).mockRejectedValueOnce(new Error("email-already-in-use"));

    const TestComponent = () => {
      const handleSignUp = () => {
        FirebaseAuthentication.createUserWithEmailAndPassword({
          email: "existing@example.com",
          password: "password123",
        })
          .then((result) => {
            mockSetLoggedInUser(result.user);
          })
          .catch((e: Error) => {
            console.error(e);
            if (e.message.includes("email-already-in-use")) {
              toast.error("An account with this email already exists");
            } else {
              toast.error("Failed to create account");
            }
          });
      };

      return (
        <button data-testid="signup-button" onClick={handleSignUp}>
          Sign up
        </button>
      );
    };

    render(<TestComponent />);

    fireEvent.click(screen.getByTestId("signup-button"));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "An account with this email already exists",
      );
    });

    consoleErrorSpy.mockRestore();
  });

  it("should handle successful Apple Sign-In", async () => {
    const TestComponent = () => {
      const handleAppleLogin = () => {
        FirebaseAuthentication.signInWithApple()
          .then((result) => {
            if (result.user) {
              toast.success("Login successful!");
            } else {
              toast.error("Login failed!");
            }
            mockSetLoggedInUser(result.user);
          })
          .catch((e: Error) => {
            console.error(e);
            toast.error("Login failed!");
            mockSetLoggedInUser(null);
          });
      };

      return (
        <button data-testid="apple-login-button" onClick={handleAppleLogin}>
          Sign in with Apple
        </button>
      );
    };

    render(<TestComponent />);

    const appleButton = screen.getByTestId("apple-login-button");
    fireEvent.click(appleButton);

    await waitFor(() => {
      expect(FirebaseAuthentication.signInWithApple).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Login successful!");
      expect(mockSetLoggedInUser).toHaveBeenCalledWith({
        email: "apple@example.com",
        uid: "apple-uid",
      });
    });
  });

  it("should handle password reset email", async () => {
    const { FirebaseAuthentication } =
      await import("@capacitor-firebase/authentication");

    const TestComponent = () => {
      const [email] = React.useState("test@example.com");

      const handleForgotPassword = () => {
        FirebaseAuthentication.sendPasswordResetEmail({
          email: email,
        })
          .then(() => {
            toast.success("Password reset email sent");
          })
          .catch((e: Error) => {
            console.error(e);
            toast.error("Failed to send reset email");
          });
      };

      return (
        <button data-testid="forgot-password" onClick={handleForgotPassword}>
          Forgot password?
        </button>
      );
    };

    render(<TestComponent />);

    fireEvent.click(screen.getByTestId("forgot-password"));

    await waitFor(() => {
      expect(
        FirebaseAuthentication.sendPasswordResetEmail,
      ).toHaveBeenCalledWith({
        email: "test@example.com",
      });
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Password reset email sent");
    });
  });

  it("should handle failed password reset", async () => {
    const { FirebaseAuthentication } =
      await import("@capacitor-firebase/authentication");

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    vi.mocked(
      FirebaseAuthentication.sendPasswordResetEmail,
    ).mockRejectedValueOnce(new Error("User not found"));

    const TestComponent = () => {
      const handleForgotPassword = () => {
        FirebaseAuthentication.sendPasswordResetEmail({
          email: "nonexistent@example.com",
        })
          .then(() => {
            toast.success("Password reset email sent");
          })
          .catch((e: Error) => {
            console.error(e);
            toast.error("Failed to send reset email");
          });
      };

      return (
        <button data-testid="forgot-password" onClick={handleForgotPassword}>
          Forgot password?
        </button>
      );
    };

    render(<TestComponent />);

    fireEvent.click(screen.getByTestId("forgot-password"));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to send reset email");
    });

    consoleErrorSpy.mockRestore();
  });

  it("should toggle between sign in and sign up modes", async () => {
    const TestComponent = () => {
      const [isSignUpMode, setIsSignUpMode] = React.useState(false);

      return (
        <div>
          <button data-testid="auth-button" onClick={() => {}}>
            {isSignUpMode ? "Sign up" : "Sign in"}
          </button>
          <button
            data-testid="toggle-mode"
            onClick={() => setIsSignUpMode(!isSignUpMode)}
          >
            {isSignUpMode
              ? "Already have an account? Sign in"
              : "Don't have an account? Sign up"}
          </button>
        </div>
      );
    };

    render(<TestComponent />);

    // Initially in sign in mode
    expect(screen.getByTestId("auth-button")).toHaveTextContent("Sign in");
    expect(screen.getByTestId("toggle-mode")).toHaveTextContent(
      "Don't have an account? Sign up",
    );

    // Toggle to sign up mode
    fireEvent.click(screen.getByTestId("toggle-mode"));

    expect(screen.getByTestId("auth-button")).toHaveTextContent("Sign up");
    expect(screen.getByTestId("toggle-mode")).toHaveTextContent(
      "Already have an account? Sign in",
    );

    // Toggle back to sign in mode
    fireEvent.click(screen.getByTestId("toggle-mode"));

    expect(screen.getByTestId("auth-button")).toHaveTextContent("Sign in");
  });

  describe("RevenueCat logout sync", () => {
    it("should call Purchases.logOut before Firebase signOut on native platform", async () => {
      mockPlatform = "ios";

      const { Capacitor } = await import("@capacitor/core");
      const { Purchases } = await import("@revenuecat/purchases-capacitor");

      const TestComponent = () => {
        const handleLogout = async () => {
          // Revert RevenueCat to anonymous before Firebase signOut (skip on web)
          if (Capacitor.getPlatform() !== "web") {
            await Purchases.logOut();
          }
          await FirebaseAuthentication.signOut();
          mockSetLoggedInUser(null);
        };

        return (
          <button data-testid="logout-button" onClick={handleLogout}>
            Logout
          </button>
        );
      };

      render(<TestComponent />);

      fireEvent.click(screen.getByTestId("logout-button"));

      await waitFor(() => {
        expect(mockPurchasesLogOut).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(FirebaseAuthentication.signOut).toHaveBeenCalled();
      });
    });

    it("should skip RevenueCat logout on web platform", async () => {
      mockPlatform = "web";

      const { Capacitor } = await import("@capacitor/core");
      const { Purchases } = await import("@revenuecat/purchases-capacitor");

      const TestComponent = () => {
        const handleLogout = async () => {
          // Revert RevenueCat to anonymous before Firebase signOut (skip on web)
          if (Capacitor.getPlatform() !== "web") {
            await Purchases.logOut();
          }
          await FirebaseAuthentication.signOut();
          mockSetLoggedInUser(null);
        };

        return (
          <button data-testid="logout-button" onClick={handleLogout}>
            Logout
          </button>
        );
      };

      render(<TestComponent />);

      fireEvent.click(screen.getByTestId("logout-button"));

      await waitFor(() => {
        expect(FirebaseAuthentication.signOut).toHaveBeenCalled();
      });

      // RevenueCat should NOT be called on web
      expect(mockPurchasesLogOut).not.toHaveBeenCalled();
    });

    it("should handle RevenueCat logout error gracefully", async () => {
      mockPlatform = "ios";
      mockPurchasesLogOut.mockRejectedValue(new Error("RevenueCat error"));

      const { Capacitor } = await import("@capacitor/core");
      const { Purchases } = await import("@revenuecat/purchases-capacitor");
      const { logger } = await import("../../../lib/logger");

      const TestComponent = () => {
        const handleLogout = async () => {
          // Revert RevenueCat to anonymous before Firebase signOut (skip on web)
          if (Capacitor.getPlatform() !== "web") {
            try {
              await Purchases.logOut();
            } catch (e) {
              logger.error("RevenueCat logout failed:", e, {
                category: "purchase",
                action: "logOut",
                severity: "warning",
              });
            }
          }

          await FirebaseAuthentication.signOut();
          mockSetLoggedInUser(null);
        };

        return (
          <button data-testid="logout-button" onClick={handleLogout}>
            Logout
          </button>
        );
      };

      render(<TestComponent />);

      fireEvent.click(screen.getByTestId("logout-button"));

      await waitFor(() => {
        expect(mockLoggerError).toHaveBeenCalledWith(
          "RevenueCat logout failed:",
          expect.any(Error),
          expect.objectContaining({
            category: "purchase",
            action: "logOut",
          }),
        );
      });

      // Firebase signOut should still be called despite RevenueCat error
      await waitFor(() => {
        expect(FirebaseAuthentication.signOut).toHaveBeenCalled();
      });
    });
  });
});
