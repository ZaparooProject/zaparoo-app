/** Core's device.endpoints answer, read defensively. */

import { formatDeviceEndpoint, isValidHost } from "@/lib/devices/endpoint";
import type { DeviceEndpointsResult } from "./types";

export const DEVICE_ENDPOINTS_METHOD = "device.endpoints";
const MAX_ADDRESSES = 16;
const MAX_NAME_LENGTH = 64;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

function readName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(CONTROL_CHARACTERS, "").trim().slice(0, MAX_NAME_LENGTH);
}

export function parseDeviceEndpointsResult(
  value: unknown,
): DeviceEndpointsResult | null {
  if (typeof value !== "object" || value === null) return null;
  const result = value as Record<string, unknown>;
  const deviceId =
    typeof result.deviceId === "string" ? result.deviceId.trim() : "";
  const port = result.port;
  if (
    deviceId === "" ||
    typeof port !== "number" ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    return null;
  }
  const scheme = result.scheme === "wss" ? "wss" : "ws";
  const addresses = Array.isArray(result.addresses)
    ? result.addresses
        .filter((address): address is string => typeof address === "string")
        .map((address) => address.trim().toLowerCase())
        .filter((address) => address !== "" && isValidHost(address))
        .slice(0, MAX_ADDRESSES)
    : [];
  const name = readName(result.name);
  return {
    deviceId,
    ...(name ? { name } : {}),
    scheme,
    addresses: [...new Set(addresses)],
    port,
    ble: result.ble === true,
  };
}

/** The WebSocket URLs a device.endpoints answer offers. */
export function webSocketUrlsFromEndpoints(
  endpoints: DeviceEndpointsResult,
): string[] {
  const scheme = endpoints.scheme === "wss" ? "wss" : "ws";
  return endpoints.addresses.map(
    (address) => formatDeviceEndpoint(address, endpoints.port, scheme).wsUrl,
  );
}
