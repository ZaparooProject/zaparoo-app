import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Device } from "@capacitor/device";
import { Capacitor } from "@capacitor/core";
import toast from "react-hot-toast";
import { SlideModal } from "@/components/SlideModal";
import { Button } from "@/components/wui/Button";
import { TextInput } from "@/components/wui/TextInput";
import { PinInput } from "@/components/wui/PinInput";
import { parseDeviceAddress } from "@/lib/coreApi";
import { performPairing, PairingError } from "@/lib/crypto/pairing";
import {
  credentialKeyForRecord,
  credentialStore,
} from "@/lib/crypto/credentials";
import { connectionManager } from "@/lib/transport";
import { logger } from "@/lib/logger";

function safePlatform(): string {
  try {
    return Capacitor.getPlatform();
  } catch {
    return "";
  }
}

interface PairingModalProps {
  isOpen: boolean;
  close: () => void;
  /** Where the pairing handshake is sent. */
  address: string;
  /** The device record the resulting credentials belong to. */
  recordId: string;
  onSuccess?: () => void;
}

export function PairingModal({
  isOpen,
  close,
  address,
  recordId,
  onSuccess,
}: PairingModalProps) {
  const { t } = useTranslation();

  const [pin, setPin] = useState("");
  const [clientName, setClientName] = useState("");
  const [isPairing, setIsPairing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Tracks an in-flight pair attempt so onComplete doesn't fire twice if the
  // user is still mid-submit when the 6th digit lands.
  const pairingInFlight = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Clear transient form state when the modal closes.
      setPin("");
      setClientName("");
      setError(null);
      setIsPairing(false);
      pairingInFlight.current = false;
      return;
    }
    // Prefill a sensible identifier when the modal opens so the user can see
    // what's about to be sent and edit it before pairing.
    let cancelled = false;
    if (Capacitor.isNativePlatform()) {
      Device.getInfo()
        .then((info) => {
          if (cancelled) return;
          const name = info.name || info.model || "Unknown";
          const suggested = name.slice(0, 120);
          setClientName((current) => (current ? current : suggested));
        })
        .catch(() => {
          if (cancelled) return;
          setClientName((current) =>
            current ? current : `Zaparoo App ${safePlatform()}`,
          );
        });
    } else {
      setClientName((current) =>
        current ? current : `Zaparoo App ${safePlatform()}`,
      );
    }
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const resolveClientName = useCallback(() => {
    return clientName.trim() || `Zaparoo App ${safePlatform()}`.slice(0, 120);
  }, [clientName]);

  const handlePair = async (pinOverride?: string) => {
    const submittedPin = pinOverride ?? pin;
    if (!/^\d{6}$/.test(submittedPin) || !address || !recordId) return;
    if (pairingInFlight.current) return;
    pairingInFlight.current = true;
    setError(null);
    setIsPairing(true);
    try {
      const name = resolveClientName();
      const { host, port } = parseDeviceAddress(address);
      const result = await performPairing(host, port, submittedPin, name);
      const hexKey = Array.from(result.pairingKey)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      // Pairing always belongs to the record we are connected through, so the
      // credential goes straight to the canonical key — there is no address to
      // migrate from.
      await credentialStore.set(credentialKeyForRecord(recordId), {
        authToken: result.authToken,
        pairingKey: hexKey,
        clientId: result.clientId,
        pairedAt: Date.now(),
      });
      toast.success(t("pairing.success"));
      connectionManager.clearEncryptionBlockActive();
      onSuccess?.();
      close();
    } catch (e) {
      if (e instanceof PairingError) {
        logger.error("Pairing failed", e, {
          category: "connection",
          action: "pair",
          severity: "error",
          kind: e.kind,
        });
        setError(t(`pairing.error.${e.kind}`));
      } else {
        logger.error("Pairing failed with unknown error", e, {
          category: "connection",
          action: "pair",
          severity: "error",
          kind: "unknown",
        });
        setError(t("pairing.error.unknown"));
      }
    } finally {
      setIsPairing(false);
      pairingInFlight.current = false;
    }
  };

  return (
    <SlideModal
      isOpen={isOpen}
      close={close}
      title={t("pairing.title")}
      footer={
        <div className="pt-3">
          <Button
            label={isPairing ? t("pairing.pairing") : t("pairing.startPairing")}
            disabled={isPairing || pin.length !== 6 || !address || !recordId}
            onClick={() => void handlePair()}
            intent="primary"
            className="w-full"
          />
        </div>
      }
    >
      <div className="flex flex-col gap-4 py-4">
        <p className="text-muted-foreground text-sm">
          {t("pairing.description")}
        </p>

        {address ? (
          <p className="text-foreground text-sm font-medium break-all">
            {address}
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">
            {t("pairing.noAddress")}
          </p>
        )}

        <TextInput
          label={t("pairing.clientNameLabel")}
          value={clientName}
          setValue={(v) => setClientName(v.slice(0, 120))}
          maxLength={120}
          disabled={isPairing}
        />

        <PinInput
          label={t("pairing.pinLabel")}
          value={pin}
          setValue={setPin}
          length={6}
          disabled={isPairing}
          onComplete={(value) => {
            void handlePair(value);
          }}
        />

        {error && (
          <p className="text-error text-sm" role="alert">
            {error}
          </p>
        )}
      </div>
    </SlideModal>
  );
}
