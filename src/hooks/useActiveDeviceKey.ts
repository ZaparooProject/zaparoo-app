import { useDeviceRegistry } from "@/lib/devices/deviceRegistry";

/**
 * The stable namespace for anything scoped to the connected device — query
 * keys, session state, image caches.
 *
 * It is the active record's ID, never its address. Addresses move between
 * devices, so namespacing cache on one lets a system list, artwork, or library
 * page survive a device switch and be served for the wrong box. Empty string
 * before the registry hydrates, which reads as "no device" everywhere it is
 * used.
 */
export function useActiveDeviceKey(): string {
  return useDeviceRegistry(selectActiveRecordId);
}

function selectActiveRecordId(state: {
  activeRecordId: string | null;
}): string {
  return state.activeRecordId ?? "";
}
