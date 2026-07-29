import { ClientCapability } from "@/lib/models";
import { useStatusStore } from "@/lib/store";

export function useClientCapability(capability: ClientCapability): boolean {
  return useStatusStore(
    (state) =>
      state.connected &&
      (state.currentClient?.capabilities.includes(capability) ?? false),
  );
}
