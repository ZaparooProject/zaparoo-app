export const DEFAULT_DEVICE_PORT = 7497;

export type DeviceEndpointScheme = "ws" | "wss";

export interface ParsedDeviceEndpoint {
  endpointId: string;
  scheme: DeviceEndpointScheme;
  host: string;
  port: number;
  address: string;
  wsUrl: string;
}

export type DeviceEndpointParseResult =
  | { ok: true; endpoint: ParsedDeviceEndpoint }
  | { ok: false };

function parsePort(port: string | undefined): number | null {
  if (port === undefined) return DEFAULT_DEVICE_PORT;
  if (!/^\d+$/.test(port)) return null;

  const parsed = Number(port);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535
    ? parsed
    : null;
}

function isValidIPv4(host: string): boolean {
  const octets = host.split(".");
  return (
    octets.length === 4 &&
    octets.every((octet) => {
      if (!/^\d+$/.test(octet)) return false;
      if (octet.length > 1 && octet.startsWith("0")) return false;
      const parsed = Number(octet);
      return parsed >= 0 && parsed <= 255;
    })
  );
}

/**
 * The canonical spelling of an IPv6 host, or null if it is not one.
 *
 * The URL parser already collapses equivalent forms — `0:0:0:0:0:0:0:1`, `::1`
 * and `FE80::0001` each have exactly one canonical spelling — and returning it
 * rather than a bare boolean is what stops two spellings of a single address
 * becoming two endpoint identities, and therefore two devices.
 */
function canonicalIPv6(host: string): string | null {
  try {
    return new URL(`ws://[${host}]`).hostname.replace(/^\[|\]$/g, "");
  } catch {
    return null;
  }
}

function isValidHostname(host: string): boolean {
  if (host.length === 0 || host.length > 253) return false;
  if (/^[0-9.]+$/.test(host)) return false;

  return host
    .split(".")
    .every(
      (label) =>
        label.length > 0 &&
        label.length <= 63 &&
        /^[a-z0-9-]+$/i.test(label) &&
        !label.startsWith("-") &&
        !label.endsWith("-"),
    );
}

/**
 * Exported for callers that hand `formatDeviceEndpoint` a host from outside the
 * parser — mDNS advertisements, for one. `formatDeviceEndpoint` itself assumes
 * a validated host and would happily format a malformed one into a wsUrl that
 * only fails later as an opaque socket error.
 */
export function isValidHost(host: string): boolean {
  return (
    isValidIPv4(host) || canonicalIPv6(host) !== null || isValidHostname(host)
  );
}

function formatHost(host: string): string {
  return host.includes(":") ? `[${host}]` : host;
}

export function formatDeviceEndpoint(
  host: string,
  port: number,
  scheme: DeviceEndpointScheme = "ws",
): ParsedDeviceEndpoint {
  const normalizedHost = host.toLowerCase();
  const formattedHost = formatHost(normalizedHost);
  const authority = `${formattedHost}:${port}`;
  const endpointId = `${scheme}://${authority}`;
  const displayAuthority =
    port === DEFAULT_DEVICE_PORT ? formattedHost : authority;

  return {
    endpointId,
    scheme,
    host: normalizedHost,
    port,
    address: scheme === "wss" ? `wss://${displayAuthority}` : displayAuthority,
    wsUrl: `${endpointId}/api/v0.1`,
  };
}

/**
 * The port the user actually typed, read back off the raw authority.
 *
 * `URL` erases a port that matches the scheme default, so `http://core:80` and
 * `wss://core:443` both arrive with an empty `port` and would silently fall
 * back to 7497 — dialling somewhere the user never asked for. Only the
 * authority is inspected, and a bracketed literal is stepped over first, so
 * `http://[::80]` is read as a host rather than as port 80.
 */
/**
 * The same endpoint reached through a different host — an mDNS `.local` name
 * swapped for the IP the advertisement resolved to. An unusable host is
 * ignored rather than thrown so a bad advertisement degrades to the hostname
 * the record already had.
 */
export function replaceDeviceEndpointHost(
  endpoint: ParsedDeviceEndpoint,
  host: string,
): ParsedDeviceEndpoint {
  if (!isValidHost(host.toLowerCase())) return endpoint;
  return formatDeviceEndpoint(host, endpoint.port, endpoint.scheme);
}

function explicitAuthorityPort(input: string): string | undefined {
  const authority = input.slice(input.indexOf("://") + 3).split(/[/?#]/)[0];
  if (authority === undefined) return undefined;

  const hostAndPort = authority.slice(authority.lastIndexOf("@") + 1);
  const separator = hostAndPort.startsWith("[")
    ? hostAndPort.indexOf(":", hostAndPort.indexOf("]"))
    : hostAndPort.indexOf(":");
  return separator === -1 ? undefined : hostAndPort.slice(separator + 1);
}

function parseUrlInput(input: string): DeviceEndpointParseResult | null {
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) return null;

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { ok: false };
  }

  if (!["ws:", "wss:", "http:", "https:"].includes(url.protocol)) {
    return { ok: false };
  }
  if (url.username || url.password || url.search || url.hash) {
    return { ok: false };
  }
  if (!["", "/", "/api/v0.1"].includes(url.pathname)) {
    return { ok: false };
  }

  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const port = parsePort(url.port || explicitAuthorityPort(input));
  if (port === null || !isValidHost(host)) return { ok: false };

  const scheme: DeviceEndpointScheme = ["https:", "wss:"].includes(url.protocol)
    ? "wss"
    : "ws";
  return { ok: true, endpoint: formatDeviceEndpoint(host, port, scheme) };
}

export function parseDeviceEndpoint(input: string): DeviceEndpointParseResult {
  const address = input.trim();
  if (!address || /\s/.test(address)) return { ok: false };

  const urlResult = parseUrlInput(address);
  if (urlResult) return urlResult;

  if (address.startsWith("[")) {
    const match = /^\[([^\]]+)](?::([^:]+))?$/.exec(address);
    if (!match) return { ok: false };
    const [, rawHost, portInput] = match;
    const host = rawHost === undefined ? null : canonicalIPv6(rawHost);
    const port = parsePort(portInput);
    if (host === null || port === null) return { ok: false };
    return { ok: true, endpoint: formatDeviceEndpoint(host, port) };
  }

  const colonCount = (address.match(/:/g) ?? []).length;
  if (colonCount > 1) {
    const host = canonicalIPv6(address);
    if (host === null) return { ok: false };
    return {
      ok: true,
      endpoint: formatDeviceEndpoint(host, DEFAULT_DEVICE_PORT),
    };
  }

  if (colonCount === 1) {
    const [rawHost, portInput] = address.split(":");
    const host = rawHost?.toLowerCase();
    const port = parsePort(portInput);
    if (!host || port === null || !isValidHost(host)) return { ok: false };
    return { ok: true, endpoint: formatDeviceEndpoint(host, port) };
  }

  const host = address.toLowerCase();
  if (!isValidHost(host)) return { ok: false };
  return {
    ok: true,
    endpoint: formatDeviceEndpoint(host, DEFAULT_DEVICE_PORT),
  };
}
