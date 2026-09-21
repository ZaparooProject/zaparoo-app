/**
 * Integration Test: Home reader strip
 *
 * Replaces the old Last Scanned readout. Answers "is anything on a reader".
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, within } from "@/test-utils";
import { ReaderStrip } from "@/components/home/ReaderStrip";
import { CoreAPI } from "@/lib/coreApi";
import { useStatusStore, ConnectionState } from "@/lib/store";
import { mockReaderInfo } from "@/test-utils/factories";

function readerRegion() {
  return within(screen.getByRole("region", { name: "scan.readersHeading" }));
}

describe("Home reader strip", () => {
  beforeEach(() => {
    useStatusStore.setState({
      ...useStatusStore.getInitialState(),
      connected: true,
      connectionState: ConnectionState.CONNECTED,
      coreVersion: "2.17.0",
      coreVersionPending: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists the readers attached to the device", async () => {
    vi.spyOn(CoreAPI, "readers").mockResolvedValue({
      readers: [
        mockReaderInfo({
          id: "pn532:/dev/ttyUSB0",
          readerId: "pn532:/dev/ttyUSB0",
          info: "PN532 on USB",
          connected: true,
        }),
      ],
    });

    render(<ReaderStrip connected />);

    expect(await readerRegion().findByText("PN532 on USB")).toBeVisible();
  });

  it("marks the reader holding the running media", async () => {
    vi.spyOn(CoreAPI, "readers").mockResolvedValue({
      readers: [
        mockReaderInfo({
          id: "holder",
          readerId: "holder",
          info: "Cartridge slot",
          connected: true,
        }),
        mockReaderInfo({
          id: "other",
          readerId: "other",
          info: "Desk reader",
          connected: true,
        }),
      ],
      holdOwnerReaderId: "holder",
    });

    render(<ReaderStrip connected />);

    await readerRegion().findByText("Cartridge slot");
    expect(readerRegion().getByText("scan.readerHolding")).toBeVisible();
  });

  it("says so when the device reports no readers", async () => {
    vi.spyOn(CoreAPI, "readers").mockResolvedValue({ readers: [] });

    render(<ReaderStrip connected />);

    expect(
      await readerRegion().findByText("settings.readers.noReadersDetected"),
    ).toBeVisible();
  });

  it("does not ask for readers while disconnected", () => {
    const readers = vi.spyOn(CoreAPI, "readers");
    useStatusStore.setState({ connected: false });

    render(<ReaderStrip connected={false} />);

    expect(readerRegion().getByText("settings.notConnected")).toBeVisible();
    expect(readers).not.toHaveBeenCalled();
  });
});
