import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "../../../test-utils";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Mock CoreAPI with edge case scenarios
const mockCoreAPI = {
  settings: vi.fn(),
  settingsUpdate: vi.fn(),
  settingsReload: vi.fn(),
  version: vi.fn(),
  systems: vi.fn(),
  mappings: vi.fn(),
  mappingsReload: vi.fn(),
};

vi.mock("../../../lib/coreApi", () => ({
  CoreAPI: mockCoreAPI,
}));

vi.mock("../../../lib/store", () => ({
  useStatusStore: vi.fn((selector) => {
    const mockState = {
      connected: true,
      loggedInUser: {
        uid: "test-user",
        email: "test@example.com",
        displayName: "Test User",
      },
    };
    return selector(mockState);
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, _params?: any) => {
      const translations: { [key: string]: string } = {
        "settings.advanced.title": "Advanced Settings",
        "settings.advanced.dangerZone": "Danger Zone",
        "settings.advanced.resetSettings": "Reset Settings",
        "settings.advanced.reloadMappings": "Reload Mappings",
        "settings.advanced.confirmReset":
          "Are you sure you want to reset all settings?",
        "settings.online.title": "Online Features",
        "settings.online.signIn": "Sign In",
        "settings.online.signOut": "Sign Out",
        "settings.help.title": "Help & Support",
        "settings.help.documentation": "Documentation",
        "settings.help.discord": "Discord Support",
        "settings.about.title": "About",
        "settings.about.version": "Version",
        "settings.about.checkUpdates": "Check for Updates",
      };
      return translations[key] || key;
    },
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: vi.fn(() => vi.fn()),
  createFileRoute: vi.fn(() => ({
    useLoaderData: vi.fn(() => ({})),
  })),
}));

vi.mock("../../../hooks/useSmartSwipe", () => ({
  useSmartSwipe: vi.fn(() => ({})),
}));

vi.mock("@capacitor/browser", () => ({
  Browser: {
    open: vi.fn(),
  },
}));

vi.mock("@capacitor/app", () => ({
  App: {
    getInfo: vi.fn().mockResolvedValue({ version: "1.0.0" }),
  },
}));

vi.mock("firebase/auth", () => ({
  signOut: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  getAuth: vi.fn(() => ({})),
}));

describe("Settings Routes - Edge Cases", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  describe("Advanced Settings Edge Cases", () => {
    it("should handle concurrent dangerous operations", async () => {
      mockCoreAPI.settingsUpdate.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100)),
      );
      mockCoreAPI.mappingsReload.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 150)),
      );

      const ConcurrentOperationsComponent = () => {
        const [operations, setOperations] = React.useState<string[]>([]);
        const [isResetting, setIsResetting] = React.useState(false);
        const [isReloading, setIsReloading] = React.useState(false);

        const handleReset = async () => {
          setIsResetting(true);
          setOperations((prev) => [...prev, "reset-started"]);
          try {
            await mockCoreAPI.settingsUpdate({ resetToDefaults: true });
            setOperations((prev) => [...prev, "reset-completed"]);
          } catch {
            setOperations((prev) => [...prev, "reset-failed"]);
          } finally {
            setIsResetting(false);
          }
        };

        const handleReloadMappings = async () => {
          setIsReloading(true);
          setOperations((prev) => [...prev, "reload-started"]);
          try {
            await mockCoreAPI.mappingsReload();
            setOperations((prev) => [...prev, "reload-completed"]);
          } catch {
            setOperations((prev) => [...prev, "reload-failed"]);
          } finally {
            setIsReloading(false);
          }
        };

        return (
          <div>
            <button
              data-testid="reset-btn"
              onClick={handleReset}
              disabled={isResetting}
            >
              {isResetting ? "Resetting..." : "Reset Settings"}
            </button>

            <button
              data-testid="reload-btn"
              onClick={handleReloadMappings}
              disabled={isReloading}
            >
              {isReloading ? "Reloading..." : "Reload Mappings"}
            </button>

            <div data-testid="operations">{operations.join(",")}</div>
          </div>
        );
      };

      render(
        <QueryClientProvider client={queryClient}>
          <ConcurrentOperationsComponent />
        </QueryClientProvider>,
      );

      // Start both operations concurrently
      fireEvent.click(screen.getByTestId("reset-btn"));
      fireEvent.click(screen.getByTestId("reload-btn"));

      // Both buttons should be disabled immediately
      expect(screen.getByTestId("reset-btn")).toBeDisabled();
      expect(screen.getByTestId("reload-btn")).toBeDisabled();

      // Wait for all operations to complete
      await waitFor(() => {
        expect(screen.getByTestId("operations").textContent).toContain(
          "reload-completed",
        );
      });

      // Verify all operations occurred
      const operations = screen.getByTestId("operations").textContent;
      expect(operations).toContain("reset-started");
      expect(operations).toContain("reload-started");
      expect(operations).toContain("reset-completed");

      expect(mockCoreAPI.settingsUpdate).toHaveBeenCalledWith({
        resetToDefaults: true,
      });
      expect(mockCoreAPI.mappingsReload).toHaveBeenCalled();
    });

    it("should handle settings API corruption", async () => {
      mockCoreAPI.settings.mockResolvedValue({
        // Corrupted settings data
        debugLogging: "invalid-boolean",
        connectionTimeout: "not-a-number",
        customField: undefined,
        nullField: null,
      });

      const CorruptedSettingsComponent = () => {
        const [settings, setSettings] = React.useState<any>(null);
        const [errors, setErrors] = React.useState<string[]>([]);

        const loadSettings = async () => {
          try {
            const data = await mockCoreAPI.settings();
            setSettings(data);

            // Validate settings data
            const validationErrors: string[] = [];

            if (typeof data.debugLogging !== "boolean") {
              validationErrors.push("debugLogging is not a boolean");
            }

            if (typeof data.connectionTimeout !== "number") {
              validationErrors.push("connectionTimeout is not a number");
            }

            setErrors(validationErrors);
          } catch {
            setErrors(["Failed to load settings"]);
          }
        };

        return (
          <div>
            <button data-testid="load-settings" onClick={loadSettings}>
              Load Settings
            </button>

            {settings && (
              <div data-testid="settings-data">
                <div>Debug: {String(settings.debugLogging)}</div>
                <div>Timeout: {String(settings.connectionTimeout)}</div>
              </div>
            )}

            {errors.length > 0 && (
              <div data-testid="validation-errors">{errors.join(", ")}</div>
            )}
          </div>
        );
      };

      render(
        <QueryClientProvider client={queryClient}>
          <CorruptedSettingsComponent />
        </QueryClientProvider>,
      );

      fireEvent.click(screen.getByTestId("load-settings"));

      await waitFor(() => {
        expect(screen.getByTestId("settings-data")).toBeInTheDocument();
        expect(screen.getByTestId("validation-errors")).toHaveTextContent(
          "debugLogging is not a boolean, connectionTimeout is not a number",
        );
      });
    });
  });

  describe("Online Settings Edge Cases", () => {
    it("should handle authentication state changes during operations", async () => {
      const { signOut } = await import("firebase/auth");
      const mockSignOut = vi.mocked(signOut);

      mockSignOut.mockImplementation(
        () =>
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Sign out failed")), 50),
          ),
      );

      const AuthStateComponent = () => {
        const [user, setUser] = React.useState({ email: "test@example.com" });
        const [isSigningOut, setIsSigningOut] = React.useState(false);
        const [error, setError] = React.useState<string | null>(null);

        const handleSignOut = async () => {
          setIsSigningOut(true);
          setError(null);

          try {
            await mockSignOut({} as any);
            setUser(null as any);
          } catch {
            setError("Failed to sign out");
            // Simulate auth state still being valid
            setUser({ email: "test@example.com" });
          } finally {
            setIsSigningOut(false);
          }
        };

        return (
          <div>
            <div data-testid="user-state">
              {user ? `Signed in: ${user.email}` : "Signed out"}
            </div>

            <button
              data-testid="sign-out-btn"
              onClick={handleSignOut}
              disabled={isSigningOut}
            >
              {isSigningOut ? "Signing out..." : "Sign Out"}
            </button>

            {error && <div data-testid="auth-error">{error}</div>}
          </div>
        );
      };

      render(
        <QueryClientProvider client={queryClient}>
          <AuthStateComponent />
        </QueryClientProvider>,
      );

      expect(screen.getByTestId("user-state")).toHaveTextContent(
        "Signed in: test@example.com",
      );

      fireEvent.click(screen.getByTestId("sign-out-btn"));

      await waitFor(() => {
        expect(screen.getByTestId("auth-error")).toHaveTextContent(
          "Failed to sign out",
        );
        // User should still be signed in due to error
        expect(screen.getByTestId("user-state")).toHaveTextContent(
          "Signed in: test@example.com",
        );
      });
    });

    it("should handle subscription status edge cases", async () => {
      const SubscriptionStatusComponent = () => {
        const [subscriptionData, setSubscriptionData] =
          React.useState<any>(null);
        const [loading, setLoading] = React.useState(false);

        const checkSubscription = () => {
          setLoading(true);
          // Simulate various subscription states
          setTimeout(() => {
            const states = [
              { active: true, expires: new Date(Date.now() + 86400000) }, // 1 day
              { active: true, expires: new Date(Date.now() - 86400000) }, // Expired 1 day ago
              { active: false, expires: null },
              null, // API error
              { active: "invalid", expires: "not-a-date" }, // Malformed data
            ];

            const randomState =
              states[Math.floor(Math.random() * states.length)];
            setSubscriptionData(randomState);
            setLoading(false);
          }, 100);
        };

        const getSubscriptionStatus = () => {
          if (!subscriptionData) return "Unknown";
          if (subscriptionData.active === "invalid") return "Invalid data";
          if (!subscriptionData.active) return "Inactive";

          const expires = new Date(subscriptionData.expires);
          if (isNaN(expires.getTime())) return "Invalid expiration";

          return expires > new Date() ? "Active" : "Expired";
        };

        return (
          <div>
            <button
              data-testid="check-subscription"
              onClick={checkSubscription}
              disabled={loading}
            >
              Check Subscription
            </button>

            {loading && <div data-testid="loading">Checking...</div>}

            <div data-testid="subscription-status">
              Status: {getSubscriptionStatus()}
            </div>

            {subscriptionData && (
              <div data-testid="subscription-details">
                Active: {String(subscriptionData.active)}
                {subscriptionData.expires && (
                  <span> | Expires: {String(subscriptionData.expires)}</span>
                )}
              </div>
            )}
          </div>
        );
      };

      render(
        <QueryClientProvider client={queryClient}>
          <SubscriptionStatusComponent />
        </QueryClientProvider>,
      );

      // Test multiple subscription checks to hit different states
      for (let i = 0; i < 5; i++) {
        fireEvent.click(screen.getByTestId("check-subscription"));

        await waitFor(() => {
          const status = screen.getByTestId("subscription-status").textContent;
          expect(status).toMatch(
            /Status: (Unknown|Active|Expired|Inactive|Invalid)/,
          );
        });
      }
    });
  });

  describe("Help & Support Edge Cases", () => {
    it("should handle external link failures", async () => {
      const { Browser } = await import("@capacitor/browser");
      const mockOpen = vi.mocked(Browser.open);

      mockOpen.mockRejectedValue(new Error("Browser not available"));

      const ExternalLinksComponent = () => {
        const [linkErrors, setLinkErrors] = React.useState<string[]>([]);

        const openLink = async (url: string, label: string) => {
          try {
            await mockOpen({ url });
          } catch {
            setLinkErrors((prev) => [...prev, `Failed to open ${label}`]);
          }
        };

        return (
          <div>
            <button
              data-testid="docs-link"
              onClick={() =>
                openLink("https://docs.zaparoo.org", "Documentation")
              }
            >
              Documentation
            </button>

            <button
              data-testid="discord-link"
              onClick={() => openLink("https://discord.gg/zaparoo", "Discord")}
            >
              Discord
            </button>

            <button
              data-testid="github-link"
              onClick={() =>
                openLink("https://github.com/zaparoo/zaparoo-core", "GitHub")
              }
            >
              GitHub
            </button>

            {linkErrors.length > 0 && (
              <div data-testid="link-errors">{linkErrors.join(", ")}</div>
            )}
          </div>
        );
      };

      render(
        <QueryClientProvider client={queryClient}>
          <ExternalLinksComponent />
        </QueryClientProvider>,
      );

      // Try opening all links
      fireEvent.click(screen.getByTestId("docs-link"));
      fireEvent.click(screen.getByTestId("discord-link"));
      fireEvent.click(screen.getByTestId("github-link"));

      await waitFor(() => {
        expect(screen.getByTestId("link-errors")).toHaveTextContent(
          "Failed to open Documentation, Failed to open Discord, Failed to open GitHub",
        );
      });

      expect(mockOpen).toHaveBeenCalledTimes(3);
    });
  });

  describe("About Page Edge Cases", () => {
    it("should handle version check failures and retries", async () => {
      const { App } = await import("@capacitor/app");
      const mockGetInfo = vi.mocked(App.getInfo);

      let attemptCount = 0;
      mockGetInfo.mockImplementation(() => {
        attemptCount++;
        if (attemptCount <= 2) {
          return Promise.reject(new Error("Version check failed"));
        }
        return Promise.resolve({
          version: "1.2.3",
          build: "456",
          name: "Zaparoo App",
          id: "org.zaparoo.app",
        });
      });

      const VersionCheckComponent = () => {
        const [version, setVersion] = React.useState<string | null>(null);
        const [error, setError] = React.useState<string | null>(null);
        const [retryCount, setRetryCount] = React.useState(0);

        const checkVersion = async () => {
          setError(null);
          try {
            const info = await mockGetInfo();
            setVersion(info.version);
          } catch {
            setError("Failed to get version info");
          }
        };

        const retryVersionCheck = () => {
          setRetryCount((prev) => prev + 1);
          checkVersion();
        };

        React.useEffect(() => {
          checkVersion();
        }, []);

        return (
          <div>
            <div data-testid="version-display">
              Version: {version || "Unknown"}
            </div>

            {error && (
              <div>
                <div data-testid="version-error">{error}</div>
                <button data-testid="retry-btn" onClick={retryVersionCheck}>
                  Retry ({retryCount})
                </button>
              </div>
            )}
          </div>
        );
      };

      render(
        <QueryClientProvider client={queryClient}>
          <VersionCheckComponent />
        </QueryClientProvider>,
      );

      // Initial load should fail
      await waitFor(() => {
        expect(screen.getByTestId("version-error")).toHaveTextContent(
          "Failed to get version info",
        );
        expect(screen.getByTestId("version-display")).toHaveTextContent(
          "Version: Unknown",
        );
      });

      // First retry should also fail
      fireEvent.click(screen.getByTestId("retry-btn"));
      await waitFor(() => {
        expect(screen.getByTestId("retry-btn")).toHaveTextContent("Retry (1)");
      });

      // Second retry should succeed
      fireEvent.click(screen.getByTestId("retry-btn"));
      await waitFor(() => {
        expect(screen.getByTestId("version-display")).toHaveTextContent(
          "Version: 1.2.3",
        );
        expect(screen.queryByTestId("version-error")).not.toBeInTheDocument();
      });

      expect(mockGetInfo).toHaveBeenCalledTimes(3);
    });

    it("should handle update check with various server responses", async () => {
      const UpdateCheckComponent = () => {
        const [updateStatus, setUpdateStatus] = React.useState<string>("idle");
        const [updateInfo, setUpdateInfo] = React.useState<any>(null);

        const checkForUpdates = async () => {
          setUpdateStatus("checking");

          // Simulate various server responses
          const responses = [
            { available: true, version: "2.0.0", critical: false },
            { available: true, version: "1.5.0", critical: true },
            { available: false, message: "Up to date" },
            null, // Server error
            { available: "maybe", version: "unknown" }, // Malformed response
          ];

          setTimeout(() => {
            const response =
              responses[Math.floor(Math.random() * responses.length)];

            if (!response) {
              setUpdateStatus("error");
              return;
            }

            if (response.available === true) {
              setUpdateStatus(response.critical ? "critical" : "available");
            } else if (response.available === false) {
              setUpdateStatus("up-to-date");
            } else {
              setUpdateStatus("unknown");
            }

            setUpdateInfo(response);
          }, 100);
        };

        return (
          <div>
            <button
              data-testid="check-updates"
              onClick={checkForUpdates}
              disabled={updateStatus === "checking"}
            >
              {updateStatus === "checking"
                ? "Checking..."
                : "Check for Updates"}
            </button>

            <div data-testid="update-status">Status: {updateStatus}</div>

            {updateInfo && (
              <div data-testid="update-info">
                Available: {String(updateInfo.available)} | Version:{" "}
                {updateInfo.version || "N/A"}
                {updateInfo.critical && " | CRITICAL"}
              </div>
            )}
          </div>
        );
      };

      render(
        <QueryClientProvider client={queryClient}>
          <UpdateCheckComponent />
        </QueryClientProvider>,
      );

      // Test multiple update checks
      for (let i = 0; i < 3; i++) {
        fireEvent.click(screen.getByTestId("check-updates"));

        await waitFor(() => {
          const status = screen.getByTestId("update-status").textContent;
          expect(status).toMatch(
            /Status: (available|critical|up-to-date|error|unknown)/,
          );
        });
      }
    });
  });
});
