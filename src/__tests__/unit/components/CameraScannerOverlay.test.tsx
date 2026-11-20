import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, act } from "../../../test-utils";
import { CameraScannerOverlay } from "@/components/home/CameraScannerOverlay";
import { useContinuousCamera } from "@/hooks/useContinuousCamera";
import { CoreAPI, CoreApiError } from "@/lib/coreApi";
import { launchFeedback, MEDIA_WINDOW_MS } from "@/lib/launchFeedback";
import { sessionManager } from "@/lib/nfc";
import { Capacitor } from "@capacitor/core";
import {
  BarcodeFormat,
  BarcodeScanner,
  BarcodeValueType,
} from "@capacitor-mlkit/barcode-scanning";
import {
  __emitBarcodesScanned,
  __resetBarcodeScannerMock,
} from "../../../../__mocks__/@capacitor-mlkit/barcode-scanning";

vi.mock("@/lib/logger", () => ({
  logger: { log: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockNavigate = vi.fn();
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useNavigate: () => mockNavigate,
}));

function Harness() {
  const camera = useContinuousCamera({
    connected: true,
    hasData: true,
    launcherAccess: true,
    setLastToken: vi.fn(),
    setProPurchaseModalOpen: vi.fn(),
    onWriteCode: vi.fn(),
    onCodeRead: vi.fn(),
  });
  return (
    <>
      <button type="button" onClick={() => void camera.start()}>
        open camera
      </button>
      <CameraScannerOverlay camera={camera} />
    </>
  );
}

const barcode = (rawValue: string) => ({
  rawValue,
  displayValue: rawValue,
  format: BarcodeFormat.QrCode,
  valueType: BarcodeValueType.Text,
  cornerPoints: [
    [100, 100],
    [300, 100],
    [300, 300],
    [100, 300],
  ],
});

describe("CameraScannerOverlay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    __resetBarcodeScannerMock();
    sessionManager.launchOnScan = true;
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(Capacitor.getPlatform).mockReturnValue("android");
    vi.spyOn(CoreAPI, "run").mockResolvedValue(undefined as never);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  const openCamera = async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "open camera" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    return user;
  };

  const scan = async (code: string) => {
    await act(async () => {
      __emitBarcodesScanned([barcode(code)]);
      await vi.advanceTimersByTimeAsync(0);
    });
  };

  it("opens focused on the heading with nothing scanned yet", async () => {
    await openCamera();

    expect(
      screen.getByRole("heading", { name: "scan.cameraHeading" }),
    ).toHaveFocus();
    expect(screen.getByText("scan.cameraIdle")).toBeInTheDocument();
    expect(screen.getByText("scan.cameraIdleHint")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "scan.mapIt" }),
    ).not.toBeInTheDocument();
  });

  it("shows a code launching", async () => {
    await openCamera();

    await scan("**launch.system:snes");

    expect(screen.getByText("scan.launching")).toBeInTheDocument();
    expect(screen.getByText("**launch.system:snes")).toBeInTheDocument();
    expect(screen.getByTestId("camera-code-outline")).toHaveAttribute(
      "data-phase",
      "launching",
    );
  });

  it("shows the game that launched", async () => {
    await openCamera();
    await scan("chrono");

    act(() => {
      launchFeedback.mediaStarted({
        name: "Chrono Trigger",
        systemId: "SNES",
        systemName: "Super Nintendo",
        path: "/games/snes/chrono.sfc",
      });
    });

    expect(screen.getByText("Chrono Trigger")).toBeInTheDocument();
    expect(screen.getByText("scan.cameraLaunched")).toBeInTheDocument();
    expect(screen.getByTestId("camera-code-outline")).toHaveAttribute(
      "data-phase",
      "launched",
    );
  });

  it("shows launched without media once the window passes", async () => {
    await openCamera();
    await scan("chrono");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(MEDIA_WINDOW_MS);
    });

    expect(screen.getByText("scan.cameraLaunched")).toBeInTheDocument();
  });

  it("offers to map a code with no game and opens the mapping editor", async () => {
    vi.mocked(CoreAPI.run).mockRejectedValueOnce(
      new CoreApiError("media not found", 1, { category: "media_not_found" }),
    );
    const user = await openCamera();

    await scan("unknown-code");

    expect(screen.getByText("scan.notSetUp")).toBeInTheDocument();
    expect(screen.getByText("scan.cameraNotMapped")).toBeInTheDocument();
    expect(screen.getByTestId("camera-code-outline")).toHaveAttribute(
      "data-phase",
      "failed",
    );

    await user.click(screen.getByRole("button", { name: "scan.mapIt" }));

    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/create/mappings/new",
      search: { type: "value", pattern: "unknown-code" },
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(BarcodeScanner.stopScan).toHaveBeenCalled();
  });

  it("closes and returns focus when Done is pressed", async () => {
    const user = await openCamera();

    await user.click(screen.getByRole("button", { name: "scan.cameraDone" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(BarcodeScanner.stopScan).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "open camera" })).toHaveFocus();
  });
});
