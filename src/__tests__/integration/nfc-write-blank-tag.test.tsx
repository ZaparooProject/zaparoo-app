/**
 * Integration Test: writing to a blank (non-NDEF) tag on Android
 *
 * Renders the real Custom Text route with the real NFC writer hook, write
 * modal, and NFC session code. Only the Capacitor NFC plugin is mocked.
 *
 * The plugin cannot write to a tag it has just formatted on the same tap, so
 * the app formats once and asks for the tag to be presented again.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import userEvent from "@testing-library/user-event";
import toast, { Toaster } from "react-hot-toast";
import { Capacitor } from "@capacitor/core";
import { Nfc } from "@capawesome-team/capacitor-nfc";
import { act, render, screen, waitFor, within } from "../../test-utils";
import {
  __simulateTagScanned,
  NfcTagTechType,
} from "../../../__mocks__/@capawesome-team/capacitor-nfc";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { logger } from "@/lib/logger";
import { CustomText } from "@/routes/create.custom";

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useRouter: () => ({ navigate: vi.fn() }),
}));

const UNFORMATTED = "The NFC tag has not yet been formatted as NDEF.";

const blankTag = {
  id: [4, 17, 34, 51],
  techTypes: [
    NfcTagTechType.NfcA,
    NfcTagTechType.MifareUltralight,
    NfcTagTechType.NdefFormatable,
  ],
};

const formattedTag = {
  id: [4, 17, 34, 51],
  techTypes: [
    NfcTagTechType.NfcA,
    NfcTagTechType.MifareUltralight,
    NfcTagTechType.Ndef,
  ],
};

function renderCustomTextRoute() {
  return render(
    <>
      <CustomText />
      <Toaster />
    </>,
  );
}

/** Start a write and present a blank tag once the scan session is open. */
async function startWriteOnBlankTag(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "create.custom.write" }));
  await waitFor(() => {
    expect(Nfc.startScanSession).toHaveBeenCalled();
  });
  act(() => {
    __simulateTagScanned(blankTag);
  });
}

describe("Writing to a blank tag on Android", () => {
  beforeEach(() => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue("android");
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(Nfc.write).mockReset().mockResolvedValue(undefined);
    vi.mocked(Nfc.format).mockReset().mockResolvedValue(undefined);
    usePreferencesStore.setState({
      ...usePreferencesStore.getInitialState(),
      _hasHydrated: true,
      nfcAvailable: true,
      customText: "**launch.random:snes",
    });
  });

  afterEach(() => {
    act(() => {
      toast.remove();
    });
    vi.restoreAllMocks();
  });

  it("should format the tag, ask for it again, and write on the next tap", async () => {
    const user = userEvent.setup();
    vi.mocked(Nfc.write).mockRejectedValueOnce(new Error(UNFORMATTED));
    renderCustomTextRoute();

    await startWriteOnBlankTag(user);

    const dialog = await screen.findByRole("dialog", {
      name: "spinner.retapTag",
    });
    expect(within(dialog).getByText("spinner.retapTag")).toBeInTheDocument();
    expect(Nfc.format).toHaveBeenCalledTimes(1);
    expect(Nfc.write).toHaveBeenCalledTimes(1);

    act(() => {
      __simulateTagScanned(formattedTag);
    });

    expect(await screen.findByText("spinner.writeSuccess")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(Nfc.format).toHaveBeenCalledTimes(1);
    expect(Nfc.write).toHaveBeenCalledTimes(2);
  });

  it("should show the format error once and report it once when formatting fails", async () => {
    const user = userEvent.setup();
    const errorSpy = vi.spyOn(logger, "error");
    vi.mocked(Nfc.write).mockRejectedValue(new Error(UNFORMATTED));
    vi.mocked(Nfc.format).mockRejectedValue(new Error("Transceive failed"));
    renderCustomTextRoute();

    await startWriteOnBlankTag(user);

    expect(
      await screen.findByText("spinner.formatErrorRetry"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("spinner.writeFailed")).toHaveLength(1);
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(screen.queryByText("spinner.retapTag")).not.toBeInTheDocument();
    expect(Nfc.format).toHaveBeenCalledTimes(1);
    expect(Nfc.write).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      "NFC format before write failed",
      expect.any(Error),
      expect.objectContaining({
        severity: "warning",
        techTypes: blankTag.techTypes,
      }),
    );
  });

  it("should end the session when cancelled while waiting for the tag again", async () => {
    const user = userEvent.setup();
    vi.mocked(Nfc.write).mockRejectedValueOnce(new Error(UNFORMATTED));
    renderCustomTextRoute();

    await startWriteOnBlankTag(user);
    const dialog = await screen.findByRole("dialog", {
      name: "spinner.retapTag",
    });

    await user.click(
      within(dialog).getByRole("button", { name: "nav.cancel" }),
    );

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(Nfc.stopScanSession).toHaveBeenCalled();

    // The session's listeners are gone: a late tap does not write
    act(() => {
      __simulateTagScanned(formattedTag);
    });
    expect(Nfc.write).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("spinner.writeSuccess")).not.toBeInTheDocument();
    expect(screen.queryByText("spinner.writeFailed")).not.toBeInTheDocument();

    // A new write starts a fresh session without the re-tap prompt
    await user.click(
      screen.getByRole("button", { name: "create.custom.write" }),
    );
    expect(
      await screen.findByRole("dialog", { name: "spinner.holdTag" }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(Nfc.startScanSession).toHaveBeenCalledTimes(2);
    });
  });
});
