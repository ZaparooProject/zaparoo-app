import { describe, it, expect } from "vitest";
import {
  NfcSessionBusyError,
  NfcTransientError,
  NoWriteMethodAvailableError,
} from "@/lib/errors";
import { nfcErrorMessageKey } from "@/lib/nfcErrorMessages";

describe("nfcErrorMessageKey", () => {
  it("maps the NFC failures the app can explain to translation keys", () => {
    expect(nfcErrorMessageKey(new NfcSessionBusyError())).toBe(
      "spinner.sessionBusy",
    );
    expect(nfcErrorMessageKey(new NfcTransientError())).toBe("spinner.tagLost");
    expect(nfcErrorMessageKey(new NoWriteMethodAvailableError())).toBe(
      "write.noWriteMethodAvailable",
    );
  });

  it("leaves unrecognised failures to their own text", () => {
    expect(nfcErrorMessageKey(new Error("native plugin said no"))).toBeNull();
    expect(nfcErrorMessageKey("oops")).toBeNull();
  });
});
