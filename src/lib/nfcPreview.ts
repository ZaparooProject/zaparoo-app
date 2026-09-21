import { getAppPreviewNfcResult } from "./appPreviewStore";
import { NfcCancelledError, NfcVerificationError } from "./errors";
import { Result, Status } from "./nfc";

/** Long enough to read the scan screen, short enough to iterate on. */
const SETTLE_MS = 1200;
const RETAP_MS = 900;

const PREVIEW_UID = "04a2b3c4d5e680";
const PREVIEW_TEXT = "**launch.system:snes";

interface PreviewOperationOptions {
  /** Read operations surface tag contents; writes report no tag. */
  read?: boolean;
  onRetapRequired?: () => void;
  signal?: AbortSignal;
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new NfcCancelledError());
      return;
    }

    const onAbort = () => {
      clearTimeout(timer);
      reject(new NfcCancelledError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Waits for the cancel action, standing in for a tag that never arrives. */
function holdUntilCancelled(signal?: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    if (signal?.aborted) {
      reject(new NfcCancelledError());
      return;
    }
    signal?.addEventListener("abort", () => reject(new NfcCancelledError()), {
      once: true,
    });
  });
}

/**
 * Stands in for a local NFC session while app preview is enabled. No plugin is
 * touched; the configured outcome drives the same states a real tag produces.
 */
export async function simulateNfcOperation(
  options: PreviewOperationOptions = {},
): Promise<Result> {
  const { read = false, onRetapRequired, signal } = options;
  const outcome = getAppPreviewNfcResult();

  if (outcome === "hold") {
    return holdUntilCancelled(signal);
  }

  if (outcome === "retap") {
    await wait(RETAP_MS, signal);
    onRetapRequired?.();
  }

  await wait(SETTLE_MS, signal);

  if (outcome === "verifyFailed") {
    throw new NfcVerificationError(undefined, "mismatch");
  }

  if (outcome === "error") {
    throw new Error("Simulated NFC failure (app preview)");
  }

  return {
    status: Status.Success,
    info: {
      rawTag: null,
      tag: read ? { uid: PREVIEW_UID, text: PREVIEW_TEXT } : null,
    },
  };
}
