import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Nfc } from "@capawesome-team/capacitor-nfc";
import {
  __createMockNfcTag,
  __simulateTagScanned,
} from "../../../../__mocks__/@capawesome-team/capacitor-nfc";
import { act, render, screen, waitFor } from "../../../test-utils";
import { ProGuide } from "../../../components/ProGuide";
import { SlideModal } from "../../../components/SlideModal";
import { ProGuideAntennaStep } from "../../../components/ProGuideAntennaStep";
import { usePreferencesStore } from "../../../lib/preferencesStore";
import {
  requestProGuide,
  resetProGuideState,
  useProGuideStore,
} from "../../../lib/proGuideStore";
import { CoreAPI } from "../../../lib/coreApi";
import {
  launchFeedback,
  type LaunchFeedbackEvent,
} from "../../../lib/launchFeedback";

const mockNavigate = vi.fn();
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useNavigate: () => mockNavigate,
}));

type AntennaInfoMock = ReturnType<typeof vi.fn>;
const nfcWithAntenna = Nfc as unknown as { getAntennaInfo?: AntennaInfoMock };

function setPlatform(platform: "ios" | "android" | "web") {
  vi.mocked(Capacitor.isNativePlatform).mockReturnValue(platform !== "web");
  vi.mocked(Capacitor.getPlatform).mockReturnValue(platform);
}

function setReadyState(overrides: Record<string, unknown> = {}) {
  usePreferencesStore.setState({
    _hasHydrated: true,
    _preferencesHydrationSucceeded: true,
    tourCompleted: true,
    proGuideCompleted: false,
    launcherAccess: false,
    onlineTrialExpiresAt: null,
    nfcAvailable: true,
    cameraAvailable: true,
    accelerometerAvailable: true,
    ...overrides,
  });
}

function grantPro() {
  act(() => {
    usePreferencesStore.setState({ launcherAccess: true });
    requestProGuide();
  });
}

const latestBackButtonCallback = () =>
  [...vi.mocked(App.addListener).mock.calls]
    .reverse()
    .find(([name]) => name === "backButton")?.[1] as
    | ((event: { canGoBack: boolean }) => void)
    | undefined;

describe("ProGuide", () => {
  beforeEach(() => {
    setPlatform("ios");
    setReadyState();
    mockNavigate.mockClear();
  });

  afterEach(() => {
    resetProGuideState();
    delete nfcWithAntenna.getAntennaInfo;
    setPlatform("web");
  });

  it("shows once when Pro becomes active", async () => {
    render(<ProGuide />);
    expect(
      screen.queryByRole("dialog", { name: "proGuide.unlockTitle" }),
    ).not.toBeInTheDocument();

    grantPro();

    expect(
      await screen.findByRole("dialog", { name: "proGuide.unlockTitle" }),
    ).toBeInTheDocument();
    expect(screen.getByText("proGuide.unlockNfc")).toBeInTheDocument();
    expect(screen.getByText("proGuide.unlockCamera")).toBeInTheDocument();
    expect(screen.getByText("proGuide.unlockShake")).toBeInTheDocument();
  });

  it("shows when a trial is active", async () => {
    render(<ProGuide />);
    act(() => {
      usePreferencesStore.setState({
        launcherAccess: true,
        onlineTrialExpiresAt: "2099-01-01T00:00:00Z",
      });
    });

    expect(
      await screen.findByRole("dialog", { name: "proGuide.unlockTitle" }),
    ).toBeInTheDocument();
  });

  it("does not show when already completed", () => {
    setReadyState({ proGuideCompleted: true });
    render(<ProGuide />);
    grantPro();

    expect(
      screen.queryByRole("dialog", { name: "proGuide.unlockTitle" }),
    ).not.toBeInTheDocument();
  });

  it("waits for saved preferences before showing", async () => {
    setReadyState({ _hasHydrated: false });
    render(<ProGuide />);
    grantPro();

    expect(
      screen.queryByRole("dialog", { name: "proGuide.unlockTitle" }),
    ).not.toBeInTheDocument();

    act(() => {
      usePreferencesStore.setState({ _hasHydrated: true });
    });

    expect(
      await screen.findByRole("dialog", { name: "proGuide.unlockTitle" }),
    ).toBeInTheDocument();
  });

  it("waits for the first-run tour to finish", async () => {
    setReadyState({ tourCompleted: false });
    render(<ProGuide />);
    grantPro();

    expect(
      screen.queryByRole("dialog", { name: "proGuide.unlockTitle" }),
    ).not.toBeInTheDocument();

    act(() => {
      usePreferencesStore.setState({ tourCompleted: true });
    });

    expect(
      await screen.findByRole("dialog", { name: "proGuide.unlockTitle" }),
    ).toBeInTheDocument();
  });

  it("marks the guide completed when skipped", async () => {
    const user = userEvent.setup();
    render(<ProGuide />);
    grantPro();

    await user.click(
      await screen.findByRole("button", { name: "proGuide.skip" }),
    );

    expect(usePreferencesStore.getState().proGuideCompleted).toBe(true);
    expect(useProGuideStore.getState().open).toBe(false);
  });

  it("comes back after another dialog replaces it", async () => {
    function OtherDialog({ open }: { open: boolean }) {
      return (
        <SlideModal isOpen={open} close={() => {}} title="Other dialog">
          <p>other</p>
        </SlideModal>
      );
    }
    const { rerender } = render(
      <>
        <ProGuide />
        <OtherDialog open={false} />
      </>,
    );
    grantPro();
    await screen.findByRole("heading", { name: "proGuide.unlockTitle" });

    rerender(
      <>
        <ProGuide />
        <OtherDialog open />
      </>,
    );
    await waitFor(() => expect(useProGuideStore.getState().open).toBe(false));
    await waitFor(() => expect(useProGuideStore.getState().pending).toBe(true));
    expect(usePreferencesStore.getState().proGuideCompleted).toBe(false);

    rerender(
      <>
        <ProGuide />
        <OtherDialog open={false} />
      </>,
    );
    expect(
      await screen.findByRole("heading", { name: "proGuide.unlockTitle" }),
    ).toBeInTheDocument();
  });

  it("steps forward and back, moving focus to each step heading", async () => {
    const user = userEvent.setup();
    render(<ProGuide />);
    grantPro();

    await user.click(
      await screen.findByRole("button", { name: "proGuide.next" }),
    );
    const launchHeading = await screen.findByRole("heading", {
      name: "proGuide.launchTitle",
    });
    expect(launchHeading).toHaveFocus();
    expect(screen.getByText("proGuide.launchNfc")).toBeInTheDocument();
    expect(screen.getByText("proGuide.launchCamera")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "proGuide.next" }));
    expect(
      await screen.findByRole("heading", { name: "proGuide.antennaTitle" }),
    ).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "nav.back" }));
    expect(
      await screen.findByRole("heading", { name: "proGuide.launchTitle" }),
    ).toHaveFocus();
  });

  it("goes back a step with the Android back button, then closes", async () => {
    const user = userEvent.setup();
    render(<ProGuide />);
    grantPro();

    await user.click(
      await screen.findByRole("button", { name: "proGuide.next" }),
    );
    await screen.findByRole("heading", { name: "proGuide.launchTitle" });

    const back = latestBackButtonCallback();
    expect(back).toBeDefined();
    act(() => back?.({ canGoBack: true }));
    expect(
      await screen.findByRole("heading", { name: "proGuide.unlockTitle" }),
    ).toBeInTheDocument();

    act(() => back?.({ canGoBack: true }));
    await waitFor(() =>
      expect(usePreferencesStore.getState().proGuideCompleted).toBe(true),
    );
  });

  it("leaves out NFC steps when the phone has no NFC", async () => {
    const user = userEvent.setup();
    setReadyState({ nfcAvailable: false, accelerometerAvailable: false });
    render(<ProGuide />);
    grantPro();

    await screen.findByRole("dialog", { name: "proGuide.unlockTitle" });
    expect(screen.queryByText("proGuide.unlockNfc")).not.toBeInTheDocument();
    expect(
      screen.getByText("proGuide.stepCount", { exact: false }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "proGuide.next" }));
    await screen.findByRole("heading", { name: "proGuide.launchTitle" });
    expect(screen.queryByText("proGuide.launchNfc")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "proGuide.done" }));
    expect(usePreferencesStore.getState().proGuideCompleted).toBe(true);
  });

  it("opens shake settings from the last step and completes the guide", async () => {
    const user = userEvent.setup();
    render(<ProGuide />);
    grantPro();

    for (const title of [
      "proGuide.launchTitle",
      "proGuide.antennaTitle",
      "proGuide.shakeTitle",
    ]) {
      await user.click(
        await screen.findByRole("button", { name: "proGuide.next" }),
      );
      await screen.findByRole("heading", { name: title });
    }

    await user.click(
      screen.getByRole("button", { name: "proGuide.shakeSettings" }),
    );
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/settings/readers" });
    expect(usePreferencesStore.getState().proGuideCompleted).toBe(true);
  });
});

describe("ProGuideAntennaStep", () => {
  afterEach(() => {
    delete nfcWithAntenna.getAntennaInfo;
    setPlatform("web");
  });

  it("points iPhone users at the top edge", async () => {
    setPlatform("ios");
    render(<ProGuideAntennaStep active previewAntenna={null} />);

    expect(
      await screen.findByText("proGuide.antennaTopEdge"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("antenna-diagram")).toHaveAttribute(
      "data-antenna",
      "topEdge",
    );
  });

  it("places the spot from Android antenna info", async () => {
    setPlatform("android");
    nfcWithAntenna.getAntennaInfo = vi.fn().mockResolvedValue({
      availableAntennas: [{ locationX: 35, locationY: 40 }],
      deviceWidth: 70,
      deviceHeight: 160,
      isDeviceFoldable: false,
    });
    render(<ProGuideAntennaStep active previewAntenna={null} />);

    expect(
      await screen.findByText("proGuide.antennaPlaced"),
    ).toBeInTheDocument();
    const point = screen.getByTestId("antenna-point");
    expect(point.style.left).toBe("50%");
    expect(point.style.top).toBe("25%");
  });

  it("shows a text tip and no picture when antenna info is unavailable", async () => {
    setPlatform("android");
    nfcWithAntenna.getAntennaInfo = vi
      .fn()
      .mockRejectedValue(new Error("Requires Android 14"));
    render(<ProGuideAntennaStep active previewAntenna={null} />);

    expect(
      await screen.findByText("proGuide.antennaBroad"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("antenna-diagram")).not.toBeInTheDocument();
  });

  it("confirms a live read without launching anything", async () => {
    const user = userEvent.setup();
    setPlatform("android");
    const run = vi.spyOn(CoreAPI, "run");
    const events: LaunchFeedbackEvent[] = [];
    launchFeedback.subscribe((event) => events.push(event));
    render(<ProGuideAntennaStep active previewAntenna={null} />);

    await user.click(
      await screen.findByRole("button", { name: "proGuide.tryTag" }),
    );
    await waitFor(() => expect(Nfc.startScanSession).toHaveBeenCalled());
    await waitFor(() =>
      expect(Nfc.addListener).toHaveBeenCalledWith(
        "nfcTagScanned",
        expect.any(Function),
      ),
    );

    await act(async () => {
      __simulateTagScanned(__createMockNfcTag("04a1b2c3", "**launch.random"));
    });

    // The confirmation is shown on the step and also announced.
    const confirmations = await screen.findAllByText("proGuide.tagRead");
    expect(confirmations.some((el) => !el.closest("[aria-live]"))).toBe(true);
    expect(
      screen.getByRole("button", { name: "proGuide.tryAnotherTag" }),
    ).toBeInTheDocument();
    expect(run).not.toHaveBeenCalled();
    expect(events).toEqual([
      { kind: "read", source: "nfc", systemFeedback: true },
    ]);
  });

  it("stops the read session when unmounted", async () => {
    const user = userEvent.setup();
    setPlatform("ios");
    const { unmount } = render(
      <ProGuideAntennaStep active previewAntenna={null} />,
    );

    await user.click(
      await screen.findByRole("button", { name: "proGuide.tryTag" }),
    );
    await waitFor(() => expect(Nfc.startScanSession).toHaveBeenCalled());

    unmount();

    await waitFor(() => expect(Nfc.stopScanSession).toHaveBeenCalled());
  });

  it("stops the read session when the guide closes", async () => {
    const user = userEvent.setup();
    setPlatform("ios");
    const { rerender } = render(
      <ProGuideAntennaStep active previewAntenna={null} />,
    );

    await user.click(
      await screen.findByRole("button", { name: "proGuide.tryTag" }),
    );
    await waitFor(() => expect(Nfc.startScanSession).toHaveBeenCalled());

    rerender(<ProGuideAntennaStep active={false} previewAntenna={null} />);

    await waitFor(() => expect(Nfc.stopScanSession).toHaveBeenCalled());
    expect(
      await screen.findByRole("button", { name: "proGuide.tryTag" }),
    ).toBeInTheDocument();
  });
});
