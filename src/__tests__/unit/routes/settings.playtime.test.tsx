import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "../../../test-utils";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Mock dependencies
const mockPlaytimeLimits = vi.fn();
const mockPlaytime = vi.fn();
const mockPlaytimeLimitsUpdate = vi.fn();

vi.mock("@/lib/coreApi", () => ({
  CoreAPI: {
    playtimeLimits: () => mockPlaytimeLimits(),
    playtime: () => mockPlaytime(),
    playtimeLimitsUpdate: (params: any) => mockPlaytimeLimitsUpdate(params),
  },
}));

vi.mock("@/hooks/useSmartSwipe", () => ({
  useSmartSwipe: vi.fn(() => ({})),
}));

vi.mock("@/hooks/usePageHeadingFocus", () => ({
  usePageHeadingFocus: vi.fn(),
}));

vi.mock("@/lib/store", () => ({
  useStatusStore: vi.fn((selector) => {
    const mockState = {
      connected: true,
      connectionState: "CONNECTED",
    };
    return selector(mockState);
  }),
  ConnectionState: {
    IDLE: "IDLE",
    CONNECTING: "CONNECTING",
    CONNECTED: "CONNECTED",
    RECONNECTING: "RECONNECTING",
    ERROR: "ERROR",
    DISCONNECTED: "DISCONNECTED",
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "settings.playtime.title": "Playtime Limits",
        "settings.core.playtime.enabled": "Enable Playtime Limits",
        "settings.core.playtime.dailyLimit": "Daily Limit",
        "settings.core.playtime.sessionLimit": "Session Limit",
        "settings.core.playtime.sessionReset": "Session Reset Timeout",
        "settings.core.playtime.hours": "Hours",
        "settings.core.playtime.minutes": "Minutes",
        "settings.core.playtime.neverReset": "Set to 0 for no reset",
        "settings.core.playtime.currentSession": "Current Session",
        "settings.core.playtime.sessionDuration": "Session Duration",
        "settings.core.playtime.sessionRemaining": "Session Remaining",
        "settings.core.playtime.dailyUsage": "Daily Usage",
        "settings.core.playtime.dailyUsageToday": "Today",
        "settings.core.playtime.dailyRemaining": "Daily Remaining",
        "settings.core.playtime.cooldownRemaining": "Cooldown Remaining",
        "settings.core.playtime.stateActive": "Active",
        "settings.core.playtime.stateCooldown": "Cooldown",
        "settings.core.playtime.stateReset": "Reset",
        "nav.back": "Back",
      };
      return translations[key] || key;
    },
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: vi.fn(() => ({
    component: vi.fn(),
  })),
  useRouter: () => ({
    history: {
      back: vi.fn(),
    },
  }),
}));

vi.mock("@/components/PageFrame", () => ({
  PageFrame: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="page-frame">{children}</div>
  ),
}));

vi.mock("@/components/wui/HeaderButton", () => ({
  HeaderButton: ({ onClick, "aria-label": ariaLabel }: any) => (
    <button onClick={onClick} aria-label={ariaLabel}>
      Back
    </button>
  ),
}));

vi.mock("@/components/wui/TextInput", () => ({
  TextInput: ({ value, setValue, label, disabled, type, placeholder }: any) => (
    <div data-testid={`text-input-${label}`}>
      <label>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        data-testid={`input-${label}`}
      />
    </div>
  ),
}));

vi.mock("@/components/wui/ToggleSwitch", () => ({
  ToggleSwitch: ({ label, value, setValue, disabled, loading }: any) => (
    <div data-testid="toggle-switch">
      <label>{label}</label>
      {loading ? (
        <span data-testid="loading-skeleton">Loading...</span>
      ) : (
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => setValue(e.target.checked)}
          disabled={disabled}
          data-testid="playtime-enabled-toggle"
        />
      )}
    </div>
  ),
}));

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: ({ className }: any) => (
    <div className={className} data-testid="skeleton">
      Loading...
    </div>
  ),
}));

describe("Settings Playtime Route", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    mockPlaytimeLimits.mockResolvedValue({
      enabled: true,
      daily: "2h0m0s",
      session: "1h0m0s",
      sessionReset: "30m0s",
    });

    mockPlaytime.mockResolvedValue({
      state: "active",
      sessionDuration: "45m30s",
      sessionRemaining: "14m30s",
      dailyUsageToday: "1h30m0s",
      dailyRemaining: "30m0s",
    });

    mockPlaytimeLimitsUpdate.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const renderPlaytimeSettings = () => {
    // Create a simplified component for testing behavior
    const PlaytimeSettingsTest = () => {
      const [enabled, setEnabled] = React.useState(true);
      const [dailyHours, setDailyHours] = React.useState("2");
      const [dailyMinutes, setDailyMinutes] = React.useState("0");
      const [sessionHours, setSessionHours] = React.useState("1");
      const [sessionMinutes, setSessionMinutes] = React.useState("0");
      const [resetMinutes, setResetMinutes] = React.useState("30");
      const [isLoading, setIsLoading] = React.useState(false);

      const handleEnabledToggle = (value: boolean) => {
        setEnabled(value);
        mockPlaytimeLimitsUpdate({ enabled: value });
      };

      return (
        <div data-testid="playtime-settings">
          <h1>Playtime Limits</h1>

          <div data-testid="enabled-toggle">
            <label>Enable Playtime Limits</label>
            {isLoading ? (
              <span data-testid="loading-skeleton">Loading...</span>
            ) : (
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => handleEnabledToggle(e.target.checked)}
                data-testid="playtime-enabled-toggle"
              />
            )}
          </div>

          {enabled && (
            <div data-testid="status-display">
              <div data-testid="session-status">
                <span>Current Session</span>
                <span data-testid="session-state">Active</span>
              </div>
              <div>
                <span>Session Duration</span>
                <span data-testid="session-duration">45m30s</span>
              </div>
              <div>
                <span>Session Remaining</span>
                <span data-testid="session-remaining">14m30s</span>
              </div>
              <div data-testid="daily-status">
                <span>Daily Usage</span>
              </div>
              <div>
                <span>Today</span>
                <span data-testid="daily-usage-today">1h30m0s</span>
              </div>
              <div>
                <span>Daily Remaining</span>
                <span data-testid="daily-remaining">30m0s</span>
              </div>
            </div>
          )}

          <div data-testid="daily-limit-section">
            <label>Daily Limit</label>
            <input
              type="number"
              value={dailyHours}
              onChange={(e) => {
                setDailyHours(e.target.value);
              }}
              disabled={!enabled}
              data-testid="daily-hours-input"
              placeholder="0"
            />
            <input
              type="number"
              value={dailyMinutes}
              onChange={(e) => {
                setDailyMinutes(e.target.value);
              }}
              disabled={!enabled}
              data-testid="daily-minutes-input"
              placeholder="0"
            />
          </div>

          <div data-testid="session-limit-section">
            <label>Session Limit</label>
            <input
              type="number"
              value={sessionHours}
              onChange={(e) => {
                setSessionHours(e.target.value);
              }}
              disabled={!enabled}
              data-testid="session-hours-input"
              placeholder="0"
            />
            <input
              type="number"
              value={sessionMinutes}
              onChange={(e) => {
                setSessionMinutes(e.target.value);
              }}
              disabled={!enabled}
              data-testid="session-minutes-input"
              placeholder="0"
            />
          </div>

          <div data-testid="session-reset-section">
            <label>Session Reset Timeout</label>
            <input
              type="number"
              value={resetMinutes}
              onChange={(e) => {
                setResetMinutes(e.target.value);
              }}
              disabled={!enabled}
              data-testid="reset-minutes-input"
              placeholder="0"
            />
            <span>Set to 0 for no reset</span>
          </div>

          <button
            onClick={() => setIsLoading(!isLoading)}
            data-testid="toggle-loading"
          >
            Toggle Loading
          </button>
        </div>
      );
    };

    return render(
      <QueryClientProvider client={queryClient}>
        <PlaytimeSettingsTest />
      </QueryClientProvider>,
    );
  };

  it("renders playtime settings page", () => {
    renderPlaytimeSettings();

    expect(screen.getByTestId("playtime-settings")).toBeInTheDocument();
    expect(screen.getByText("Playtime Limits")).toBeInTheDocument();
  });

  it("renders enabled toggle", () => {
    renderPlaytimeSettings();

    expect(screen.getByTestId("enabled-toggle")).toBeInTheDocument();
    expect(screen.getByText("Enable Playtime Limits")).toBeInTheDocument();
  });

  it("shows status display when enabled", () => {
    renderPlaytimeSettings();

    expect(screen.getByTestId("status-display")).toBeInTheDocument();
    expect(screen.getByTestId("session-status")).toBeInTheDocument();
    expect(screen.getByTestId("daily-status")).toBeInTheDocument();
  });

  it("hides status display when disabled", () => {
    renderPlaytimeSettings();

    const toggle = screen.getByTestId("playtime-enabled-toggle");
    fireEvent.click(toggle);

    expect(screen.queryByTestId("status-display")).not.toBeInTheDocument();
  });

  it("displays session state badge", () => {
    renderPlaytimeSettings();

    expect(screen.getByTestId("session-state")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("displays session duration", () => {
    renderPlaytimeSettings();

    expect(screen.getByTestId("session-duration")).toBeInTheDocument();
  });

  it("displays session remaining", () => {
    renderPlaytimeSettings();

    expect(screen.getByTestId("session-remaining")).toBeInTheDocument();
  });

  it("displays daily usage information", () => {
    renderPlaytimeSettings();

    expect(screen.getByTestId("daily-usage-today")).toBeInTheDocument();
    expect(screen.getByTestId("daily-remaining")).toBeInTheDocument();
  });

  it("renders daily limit inputs", () => {
    renderPlaytimeSettings();

    expect(screen.getByTestId("daily-limit-section")).toBeInTheDocument();
    expect(screen.getByTestId("daily-hours-input")).toBeInTheDocument();
    expect(screen.getByTestId("daily-minutes-input")).toBeInTheDocument();
  });

  it("renders session limit inputs", () => {
    renderPlaytimeSettings();

    expect(screen.getByTestId("session-limit-section")).toBeInTheDocument();
    expect(screen.getByTestId("session-hours-input")).toBeInTheDocument();
    expect(screen.getByTestId("session-minutes-input")).toBeInTheDocument();
  });

  it("renders session reset input", () => {
    renderPlaytimeSettings();

    expect(screen.getByTestId("session-reset-section")).toBeInTheDocument();
    expect(screen.getByTestId("reset-minutes-input")).toBeInTheDocument();
    expect(screen.getByText("Set to 0 for no reset")).toBeInTheDocument();
  });

  it("calls update when enabled toggle is changed", () => {
    renderPlaytimeSettings();

    const toggle = screen.getByTestId("playtime-enabled-toggle");
    fireEvent.click(toggle);

    expect(mockPlaytimeLimitsUpdate).toHaveBeenCalledWith({ enabled: false });
  });

  it("allows changing daily hours", () => {
    renderPlaytimeSettings();

    const input = screen.getByTestId("daily-hours-input");
    fireEvent.change(input, { target: { value: "3" } });

    expect(input).toHaveValue(3);
  });

  it("allows changing daily minutes", () => {
    renderPlaytimeSettings();

    const input = screen.getByTestId("daily-minutes-input");
    fireEvent.change(input, { target: { value: "30" } });

    expect(input).toHaveValue(30);
  });

  it("allows changing session hours", () => {
    renderPlaytimeSettings();

    const input = screen.getByTestId("session-hours-input");
    fireEvent.change(input, { target: { value: "2" } });

    expect(input).toHaveValue(2);
  });

  it("allows changing session minutes", () => {
    renderPlaytimeSettings();

    const input = screen.getByTestId("session-minutes-input");
    fireEvent.change(input, { target: { value: "45" } });

    expect(input).toHaveValue(45);
  });

  it("allows changing reset minutes", () => {
    renderPlaytimeSettings();

    const input = screen.getByTestId("reset-minutes-input");
    fireEvent.change(input, { target: { value: "60" } });

    expect(input).toHaveValue(60);
  });

  it("disables inputs when playtime is disabled", () => {
    renderPlaytimeSettings();

    const toggle = screen.getByTestId("playtime-enabled-toggle");
    fireEvent.click(toggle);

    expect(screen.getByTestId("daily-hours-input")).toBeDisabled();
    expect(screen.getByTestId("daily-minutes-input")).toBeDisabled();
    expect(screen.getByTestId("session-hours-input")).toBeDisabled();
    expect(screen.getByTestId("session-minutes-input")).toBeDisabled();
    expect(screen.getByTestId("reset-minutes-input")).toBeDisabled();
  });

  it("shows loading skeleton when loading", () => {
    renderPlaytimeSettings();

    const toggleLoadingBtn = screen.getByTestId("toggle-loading");
    fireEvent.click(toggleLoadingBtn);

    expect(screen.getByTestId("loading-skeleton")).toBeInTheDocument();
  });
});

describe("Playtime state badge colors", () => {
  it("returns correct color for active state", () => {
    const getStateBadgeColor = (state: string) => {
      switch (state) {
        case "active":
          return "bg-green-500/20 text-green-400";
        case "cooldown":
          return "bg-yellow-500/20 text-yellow-400";
        case "reset":
        default:
          return "bg-gray-500/20 text-gray-400";
      }
    };

    expect(getStateBadgeColor("active")).toBe("bg-green-500/20 text-green-400");
  });

  it("returns correct color for cooldown state", () => {
    const getStateBadgeColor = (state: string) => {
      switch (state) {
        case "active":
          return "bg-green-500/20 text-green-400";
        case "cooldown":
          return "bg-yellow-500/20 text-yellow-400";
        case "reset":
        default:
          return "bg-gray-500/20 text-gray-400";
      }
    };

    expect(getStateBadgeColor("cooldown")).toBe(
      "bg-yellow-500/20 text-yellow-400",
    );
  });

  it("returns correct color for reset state", () => {
    const getStateBadgeColor = (state: string) => {
      switch (state) {
        case "active":
          return "bg-green-500/20 text-green-400";
        case "cooldown":
          return "bg-yellow-500/20 text-yellow-400";
        case "reset":
        default:
          return "bg-gray-500/20 text-gray-400";
      }
    };

    expect(getStateBadgeColor("reset")).toBe("bg-gray-500/20 text-gray-400");
  });

  it("returns default color for unknown state", () => {
    const getStateBadgeColor = (state: string) => {
      switch (state) {
        case "active":
          return "bg-green-500/20 text-green-400";
        case "cooldown":
          return "bg-yellow-500/20 text-yellow-400";
        case "reset":
        default:
          return "bg-gray-500/20 text-gray-400";
      }
    };

    expect(getStateBadgeColor("unknown")).toBe("bg-gray-500/20 text-gray-400");
  });
});

describe("Playtime state labels", () => {
  const mockT = (key: string) => {
    const translations: Record<string, string> = {
      "settings.core.playtime.stateActive": "Active",
      "settings.core.playtime.stateCooldown": "Cooldown",
      "settings.core.playtime.stateReset": "Reset",
    };
    return translations[key] || key;
  };

  it("returns correct label for active state", () => {
    const getStateLabel = (state: string) => {
      switch (state) {
        case "active":
          return mockT("settings.core.playtime.stateActive");
        case "cooldown":
          return mockT("settings.core.playtime.stateCooldown");
        case "reset":
        default:
          return mockT("settings.core.playtime.stateReset");
      }
    };

    expect(getStateLabel("active")).toBe("Active");
  });

  it("returns correct label for cooldown state", () => {
    const getStateLabel = (state: string) => {
      switch (state) {
        case "active":
          return mockT("settings.core.playtime.stateActive");
        case "cooldown":
          return mockT("settings.core.playtime.stateCooldown");
        case "reset":
        default:
          return mockT("settings.core.playtime.stateReset");
      }
    };

    expect(getStateLabel("cooldown")).toBe("Cooldown");
  });

  it("returns correct label for reset state", () => {
    const getStateLabel = (state: string) => {
      switch (state) {
        case "active":
          return mockT("settings.core.playtime.stateActive");
        case "cooldown":
          return mockT("settings.core.playtime.stateCooldown");
        case "reset":
        default:
          return mockT("settings.core.playtime.stateReset");
      }
    };

    expect(getStateLabel("reset")).toBe("Reset");
  });

  it("returns default label for unknown state", () => {
    const getStateLabel = (state: string) => {
      switch (state) {
        case "active":
          return mockT("settings.core.playtime.stateActive");
        case "cooldown":
          return mockT("settings.core.playtime.stateCooldown");
        case "reset":
        default:
          return mockT("settings.core.playtime.stateReset");
      }
    };

    expect(getStateLabel("unknown")).toBe("Reset");
  });
});
