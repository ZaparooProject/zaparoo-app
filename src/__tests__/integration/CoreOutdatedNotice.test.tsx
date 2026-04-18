import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "../../test-utils";
import { useStatusStore, ConnectionState } from "@/lib/store";
import { FEATURE_GATES } from "@/lib/featureGates";
import { CoreOutdatedNotice } from "@/components/CoreOutdatedNotice";

const originalGates = { ...FEATURE_GATES };

beforeEach(() => {
  vi.clearAllMocks();

  Object.assign(FEATURE_GATES, {
    testFeatureA: {
      since: "2.5.0",
      marquee: false,
      labelKey: "features.testFeatureA",
    },
  });

  useStatusStore.setState({
    ...useStatusStore.getInitialState(),
    connected: true,
    connectionState: ConnectionState.CONNECTED,
    coreVersion: "2.4.0",
    coreVersionPending: false,
  });
});

afterEach(() => {
  Object.keys(FEATURE_GATES).forEach((k) => {
    if (!(k in originalGates))
      delete (FEATURE_GATES as Record<string, unknown>)[k];
  });
  vi.restoreAllMocks();
});

describe("CoreOutdatedNotice", () => {
  it("should render notice when connected Core is below a gate version", () => {
    render(<CoreOutdatedNotice />);
    expect(screen.getByText("settings.coreOutdated.title")).toBeInTheDocument();
    expect(
      screen.getByText("settings.coreOutdated.description"),
    ).toBeInTheDocument();
  });

  it("should list unavailable features in the notice", () => {
    render(<CoreOutdatedNotice />);
    expect(screen.getByText("features.testFeatureA")).toBeInTheDocument();
  });

  it("should not render when Core version meets all gates", () => {
    useStatusStore.setState({ coreVersion: "2.5.0" });
    render(<CoreOutdatedNotice />);
    expect(
      screen.queryByText("settings.coreOutdated.title"),
    ).not.toBeInTheDocument();
  });

  it("should not render when disconnected", () => {
    useStatusStore.setState({
      connected: false,
      connectionState: ConnectionState.DISCONNECTED,
    });
    render(<CoreOutdatedNotice />);
    expect(
      screen.queryByText("settings.coreOutdated.title"),
    ).not.toBeInTheDocument();
  });

  it("should not render while version is pending", () => {
    useStatusStore.setState({ coreVersionPending: true });
    render(<CoreOutdatedNotice />);
    expect(
      screen.queryByText("settings.coreOutdated.title"),
    ).not.toBeInTheDocument();
  });

  it("should not render when coreVersion is null", () => {
    useStatusStore.setState({ coreVersion: null, coreVersionPending: false });
    render(<CoreOutdatedNotice />);
    expect(
      screen.queryByText("settings.coreOutdated.title"),
    ).not.toBeInTheDocument();
  });

  it("should not render when Core is a dev build", () => {
    useStatusStore.setState({ coreVersion: "DEVELOPMENT" });
    render(<CoreOutdatedNotice />);
    expect(
      screen.queryByText("settings.coreOutdated.title"),
    ).not.toBeInTheDocument();
  });
});
