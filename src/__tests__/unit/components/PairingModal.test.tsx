import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "../../../test-utils";
import userEvent from "@testing-library/user-event";
import { PairingModal } from "@/components/PairingModal";
import { performPairing, PairingError } from "@/lib/crypto/pairing";
import { credentialStore } from "@/lib/crypto/credentials";
import { Device } from "@capacitor/device";
import { useStatusStore } from "@/lib/store";

vi.mock("@/lib/crypto/pairing", async () => {
  const actual = await vi.importActual<typeof import("@/lib/crypto/pairing")>(
    "@/lib/crypto/pairing",
  );
  return {
    ...actual,
    performPairing: vi.fn(),
  };
});

vi.mock("@/lib/crypto/credentials", () => ({
  credentialStore: {
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(true),
    get: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
  },
  normalizeDeviceKey: (s: string) => s,
}));

vi.mock("@/lib/transport", () => ({
  connectionManager: {
    immediateReconnectActive: vi.fn(),
    clearEncryptionBlockActive: vi.fn(),
  },
}));

vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockedPerformPairing = vi.mocked(performPairing);
const mockedCredentialStoreSet = vi.mocked(credentialStore.set);
const mockedDeviceGetInfo = vi.mocked(Device.getInfo);

function setStoreHistory(address: string) {
  useStatusStore.setState({
    deviceHistory: [{ address }],
  });
}

describe("PairingModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setStoreHistory("192.168.1.10:7497");
    mockedDeviceGetInfo.mockResolvedValue({
      name: "Pixel 8",
      model: "Pixel 8",
      platform: "android",
      operatingSystem: "android",
      osVersion: "14",
      manufacturer: "Google",
      isVirtual: false,
      webViewVersion: "120",
    });
  });

  describe("rendering", () => {
    it("should render modal with pairing title when open", () => {
      render(
        <PairingModal
          isOpen={true}
          close={vi.fn()}
          address="192.168.1.10:7497"
        />,
      );

      const titles = screen.getAllByText("pairing.title");
      expect(titles.length).toBeGreaterThan(0);
    });

    it("should display the device address when provided", () => {
      render(
        <PairingModal
          isOpen={true}
          close={vi.fn()}
          address="192.168.1.10:7497"
        />,
      );

      expect(screen.getByText("192.168.1.10:7497")).toBeInTheDocument();
    });

    it("should show noAddress message when address is empty", () => {
      render(<PairingModal isOpen={true} close={vi.fn()} address="" />);

      expect(screen.getByText("pairing.noAddress")).toBeInTheDocument();
    });

    it("should disable Pair button until 6 digits are entered", async () => {
      const user = userEvent.setup();
      render(
        <PairingModal
          isOpen={true}
          close={vi.fn()}
          address="192.168.1.10:7497"
        />,
      );

      const pairButton = screen.getByRole("button", {
        name: "pairing.startPairing",
      });
      expect(pairButton).toBeDisabled();

      const pinInput = screen.getByLabelText("pairing.pinLabel");
      await user.type(pinInput, "12345");
      expect(pairButton).toBeDisabled();

      await user.type(pinInput, "6");
      expect(pairButton).toBeEnabled();
    });

    it("should prefill clientName with device name from Device.getInfo", async () => {
      render(
        <PairingModal
          isOpen={true}
          close={vi.fn()}
          address="192.168.1.10:7497"
        />,
      );

      const clientNameInput = screen.getByLabelText(
        "pairing.clientNameLabel",
      ) as HTMLInputElement;

      await waitFor(() => {
        expect(clientNameInput.value).toBe("Pixel 8");
      });
    });

    it("should fall back to model when Device info has no name", async () => {
      mockedDeviceGetInfo.mockResolvedValue({
        name: undefined,
        model: "iPhone15,3",
        platform: "ios",
        operatingSystem: "ios",
        osVersion: "17",
        manufacturer: "Apple",
        isVirtual: false,
        webViewVersion: "17",
      });

      render(
        <PairingModal
          isOpen={true}
          close={vi.fn()}
          address="192.168.1.10:7497"
        />,
      );

      const clientNameInput = screen.getByLabelText(
        "pairing.clientNameLabel",
      ) as HTMLInputElement;

      await waitFor(() => {
        expect(clientNameInput.value).toBe("iPhone15,3");
      });
    });

    it("should fall back to bare 'Zaparoo App platform' when Device.getInfo rejects", async () => {
      mockedDeviceGetInfo.mockRejectedValue(new Error("native unavailable"));

      render(
        <PairingModal
          isOpen={true}
          close={vi.fn()}
          address="192.168.1.10:7497"
        />,
      );

      const clientNameInput = screen.getByLabelText(
        "pairing.clientNameLabel",
      ) as HTMLInputElement;

      await waitFor(() => {
        expect(clientNameInput.value).toBe("Zaparoo App web");
      });
    });
  });

  describe("input handling", () => {
    it("should clamp PIN input to 6 digits", async () => {
      const user = userEvent.setup();
      render(
        <PairingModal
          isOpen={true}
          close={vi.fn()}
          address="192.168.1.10:7497"
        />,
      );

      const pinInput = screen.getByLabelText(
        "pairing.pinLabel",
      ) as HTMLInputElement;
      await user.type(pinInput, "1234567890");

      expect(pinInput.value).toBe("123456");
    });
  });

  describe("successful pairing", () => {
    it("should call performPairing, store credentials, and fire onSuccess + close", async () => {
      const user = userEvent.setup();
      const close = vi.fn();
      const onSuccess = vi.fn();
      mockedPerformPairing.mockResolvedValue({
        authToken: "test-token",
        clientId: "client-abc",
        pairingKey: new Uint8Array([0xde, 0xad, 0xbe, 0xef]),
      });

      render(
        <PairingModal
          isOpen={true}
          close={close}
          address="192.168.1.10:7497"
          onSuccess={onSuccess}
        />,
      );

      const pinInput = screen.getByLabelText("pairing.pinLabel");
      await user.type(pinInput, "654321");

      await waitFor(() => {
        expect(mockedPerformPairing).toHaveBeenCalledTimes(1);
      });

      expect(mockedPerformPairing).toHaveBeenCalledWith(
        "192.168.1.10",
        7497,
        "654321",
        expect.stringContaining("Pixel 8"),
      );

      await waitFor(() => {
        expect(mockedCredentialStoreSet).toHaveBeenCalledWith(
          "192.168.1.10:7497",
          expect.objectContaining({
            authToken: "test-token",
            clientId: "client-abc",
            pairingKey: "deadbeef",
          }),
        );
      });

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledTimes(1);
        expect(close).toHaveBeenCalledTimes(1);
      });
    });

    it("should mark the matching device history entry as paired", async () => {
      const user = userEvent.setup();
      mockedPerformPairing.mockResolvedValue({
        authToken: "tok",
        clientId: "cid",
        pairingKey: new Uint8Array([0x01, 0x02]),
      });

      render(
        <PairingModal
          isOpen={true}
          close={vi.fn()}
          address="192.168.1.10:7497"
        />,
      );

      await user.type(screen.getByLabelText("pairing.pinLabel"), "111111");
      await user.click(
        screen.getByRole("button", { name: "pairing.startPairing" }),
      );

      await waitFor(() => {
        const entry = useStatusStore
          .getState()
          .deviceHistory.find((e) => e.address === "192.168.1.10:7497");
        expect(entry?.paired).toEqual({
          clientId: "cid",
          pairedAt: expect.any(Number),
        });
      });
    });
  });

  describe("error handling", () => {
    it("should display localized error key for known PairingError kinds", async () => {
      const user = userEvent.setup();
      mockedPerformPairing.mockRejectedValue(
        new PairingError("wrong_pin", "wrong pin"),
      );

      render(
        <PairingModal
          isOpen={true}
          close={vi.fn()}
          address="192.168.1.10:7497"
        />,
      );

      await user.type(screen.getByLabelText("pairing.pinLabel"), "000000");
      await user.click(
        screen.getByRole("button", { name: "pairing.startPairing" }),
      );

      expect(
        await screen.findByText("pairing.error.wrong_pin"),
      ).toBeInTheDocument();
    });

    it("should display unknown error key for non-PairingError exceptions", async () => {
      const user = userEvent.setup();
      mockedPerformPairing.mockRejectedValue(new Error("kaboom"));

      render(
        <PairingModal
          isOpen={true}
          close={vi.fn()}
          address="192.168.1.10:7497"
        />,
      );

      await user.type(screen.getByLabelText("pairing.pinLabel"), "999999");
      await user.click(
        screen.getByRole("button", { name: "pairing.startPairing" }),
      );

      expect(
        await screen.findByText("pairing.error.unknown"),
      ).toBeInTheDocument();
    });

    it("should not call close or onSuccess when pairing fails", async () => {
      const user = userEvent.setup();
      const close = vi.fn();
      const onSuccess = vi.fn();
      mockedPerformPairing.mockRejectedValue(
        new PairingError("network", "no net"),
      );

      render(
        <PairingModal
          isOpen={true}
          close={close}
          address="192.168.1.10:7497"
          onSuccess={onSuccess}
        />,
      );

      await user.type(screen.getByLabelText("pairing.pinLabel"), "555555");
      await user.click(
        screen.getByRole("button", { name: "pairing.startPairing" }),
      );

      await screen.findByText("pairing.error.network");

      expect(close).not.toHaveBeenCalled();
      expect(onSuccess).not.toHaveBeenCalled();
    });
  });
});
