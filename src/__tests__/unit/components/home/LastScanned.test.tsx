import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { act, render, screen } from "@/test-utils";
import { LastScanned } from "@/components/home/LastScanned";
import { CoreAPI } from "@/lib/coreApi";
import { sessionManager } from "@/lib/nfc";
import { useStatusStore } from "@/lib/store";
import { runToken } from "@/lib/tokenOperations";
import { writeToClipboard } from "@/lib/clipboard";

vi.mock("@/lib/clipboard", () => ({
  writeToClipboard: vi.fn().mockResolvedValue(undefined),
}));

const emptyToken = { type: "", uid: "", text: "", data: "", scanTime: "" };

// GitHub #302: v2 stopped showing a scanned tag's ID on the Zap page.
describe("LastScanned", () => {
  beforeEach(() => {
    useStatusStore.setState({ lastToken: emptyToken });
    sessionManager.setLaunchOnScan(true);
  });

  it("should show nothing before a tag has been scanned", () => {
    render(<LastScanned />);

    expect(
      screen.queryByRole("heading", { name: "scan.lastScannedHeading" }),
    ).not.toBeInTheDocument();
  });

  it("should show the ID of a tag scanned without launching", async () => {
    const runSpy = vi.spyOn(CoreAPI, "run");
    sessionManager.setLaunchOnScan(false);
    render(<LastScanned />);

    await act(async () => {
      await runToken(
        "04a1b2c3d4e5f6",
        "",
        false,
        false,
        useStatusStore.getState().setLastToken,
        vi.fn(),
      );
    });

    expect(
      screen.getByRole("heading", { name: "scan.lastScannedHeading" }),
    ).toBeInTheDocument();
    expect(screen.getByText("04a1b2c3d4e5f6")).toBeInTheDocument();
    expect(runSpy).not.toHaveBeenCalled();
  });

  it("should show the ID beside the text of a written tag and copy it", async () => {
    const user = userEvent.setup();
    useStatusStore.setState({
      lastToken: {
        type: "ntag",
        uid: "04a1b2c3d4e5f6",
        text: "**launch.system:snes",
        data: "",
        scanTime: "2026-11-20T01:02:03Z",
      },
    });
    render(<LastScanned />);

    expect(screen.getByText("**launch.system:snes")).toBeInTheDocument();
    expect(screen.getByText("scan.lastScannedUid")).toBeInTheDocument();

    const copyButtons = screen.getAllByRole("button");
    expect(copyButtons).toHaveLength(2);
    await user.click(copyButtons[1]!);

    expect(writeToClipboard).toHaveBeenCalledWith("04a1b2c3d4e5f6");
  });

  it("should not show Core's placeholder ID for a token from an API call", () => {
    useStatusStore.setState({
      lastToken: {
        type: "",
        uid: "__api__",
        text: "**launch.random:snes",
        data: "",
        scanTime: "2026-11-20T01:02:03Z",
      },
    });
    render(<LastScanned />);

    expect(screen.getByText("**launch.random:snes")).toBeInTheDocument();
    expect(screen.queryByText("scan.lastScannedUid")).not.toBeInTheDocument();
    expect(screen.queryByText(/__api__/)).not.toBeInTheDocument();
  });
});
