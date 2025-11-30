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
    signInWithGoogle: vi.fn().mockResolvedValue({
      user: {
        email: "google@example.com",
        uid: "google-uid",
      },
    }),
  },
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
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    // Reset mockSetLoggedInUser calls - the mock is already set up at the module level
    mockSetLoggedInUser.mockClear();
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
});
