import type { BleInfo } from "./info";
import { BleLink, BleLinkDroppedError } from "./link";

/** How long an identified link waits for the transport to take it. */
export const IDENTIFIED_LINK_HOLD_MS = 15000;

interface HeldLink {
  link: BleLink;
  timer: ReturnType<typeof setTimeout>;
}

let held: HeldLink | null = null;

function release(): void {
  if (!held) return;
  clearTimeout(held.timer);
  const { link } = held;
  held = null;
  void link.close();
}

/**
 * Connects to read Core's Info, which carries the device id the app keys the
 * Core by. No session is started, so Core keeps no state. The link stays
 * open for a while so the transport can take it over: closing it and
 * connecting again costs seconds, and cuts short the bonding Core's
 * Bluetooth stack starts on a new connection.
 */
export async function identifyBluetoothDevice(
  peripheralId: string,
): Promise<BleInfo> {
  release();
  const handlers = {
    onMessage: () => undefined,
    onClose: () => {
      if (held?.link === link) {
        clearTimeout(held.timer);
        held = null;
      }
    },
  };
  let link: BleLink;
  try {
    link = await BleLink.open(peripheralId, handlers);
  } catch (error) {
    // Core drops a phone that bonded during this connection but stalled
    // before reaching its service; the phone gets through once it connects
    // again, now bonded.
    if (!(error instanceof BleLinkDroppedError)) throw error;
    link = await BleLink.open(peripheralId, handlers);
  }
  release();
  held = { link, timer: setTimeout(release, IDENTIFIED_LINK_HOLD_MS) };
  return link.info;
}

/**
 * Takes the link identifyBluetoothDevice left open to the peripheral, if it
 * is still open. The caller owns it from then on.
 */
export function takeIdentifiedLink(peripheralId: string): BleLink | null {
  if (!held || held.link.peripheralId !== peripheralId) return null;
  clearTimeout(held.timer);
  const { link } = held;
  held = null;
  return link.closed ? null : link;
}
