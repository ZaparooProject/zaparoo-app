import type { StoredCredentials } from "@/lib/crypto/credentials";
import { EncryptedSession } from "@/lib/crypto/session";
import {
  deviceRegistry,
  resolvedEndpointsForRecord,
  type DeviceRecord,
} from "@/lib/devices/deviceRegistry";
import { logger } from "@/lib/logger";

const PROBE_TIMEOUT_MS = 2500;

export type CredentialProofProbe = (
  urls: readonly string[],
  credentials: StoredCredentials,
) => Promise<boolean>;

function normalizedIdentityHints(record: DeviceRecord): Set<string> {
  const hints = new Set<string>();
  const add = (value: string | undefined) => {
    const normalized = value
      ?.trim()
      .toLowerCase()
      .replace(/\.local\.?$/, "")
      .replace(/[^a-z0-9]+/g, "");
    if (normalized) hints.add(normalized);
  };

  add(record.name);
  for (const endpoint of record.endpoints) {
    // Numeric addresses are routes, not useful names. Hostnames only narrow
    // which saved records receive a cryptographic proof attempt; they never
    // authorize a merge themselves.
    if (
      !endpoint.host.includes(":") &&
      !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(endpoint.host)
    ) {
      add(endpoint.host);
    }
  }
  return hints;
}

function recordsMayShareIdentity(
  target: DeviceRecord,
  candidate: DeviceRecord,
): boolean {
  const targetId = target.discoveryId?.trim().toLowerCase();
  const candidateId = candidate.discoveryId?.trim().toLowerCase();
  if (targetId && candidateId && targetId !== candidateId) return false;

  const targetEndpoints = new Set(
    target.endpoints.map((endpoint) => endpoint.endpointId),
  );
  if (
    candidate.endpoints.some((endpoint) =>
      targetEndpoints.has(endpoint.endpointId),
    )
  ) {
    return true;
  }

  const sharesRoute = candidate.endpoints.some((right) =>
    target.endpoints.some((left) => {
      if (left.scheme !== right.scheme || left.port !== right.port)
        return false;
      const leftHosts = new Set(
        [left.host, ...(left.resolvedAddresses ?? [])].map((host) =>
          host.toLowerCase(),
        ),
      );
      return [right.host, ...(right.resolvedAddresses ?? [])].some((host) =>
        leftHosts.has(host.toLowerCase()),
      );
    }),
  );
  if (sharesRoute) return true;

  const targetHints = normalizedIdentityHints(target);
  return [...normalizedIdentityHints(candidate)].some((hint) =>
    targetHints.has(hint),
  );
}

async function probeUrl(
  url: string,
  credentials: StoredCredentials,
): Promise<boolean> {
  const keyBytes = credentials.pairingKey.match(/.{2}/g);
  if (
    credentials.pairingKey.length === 0 ||
    credentials.pairingKey.length % 2 !== 0 ||
    !keyBytes ||
    !/^[0-9a-f]+$/i.test(credentials.pairingKey)
  ) {
    return false;
  }

  return new Promise<boolean>((resolve) => {
    let settled = false;
    let socket: WebSocket | null = null;
    const finish = (proved: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (
        socket?.readyState === WebSocket.OPEN ||
        socket?.readyState === WebSocket.CONNECTING
      ) {
        socket.close();
      }
      resolve(proved);
    };
    const timeout = setTimeout(() => finish(false), PROBE_TIMEOUT_MS);

    try {
      socket = new WebSocket(url);
    } catch {
      finish(false);
      return;
    }

    socket.onopen = () => {
      const openedSocket = socket;
      void EncryptedSession.create(
        credentials.authToken,
        new Uint8Array(keyBytes.map((value) => Number.parseInt(value, 16))),
      )
        .then(async (session) => {
          if (settled || openedSocket?.readyState !== WebSocket.OPEN) return;

          openedSocket.onmessage = (event) => {
            void (async () => {
              try {
                const frame = JSON.parse(String(event.data)) as {
                  e?: unknown;
                  error?: { code?: unknown };
                };
                if (typeof frame.e !== "string") {
                  finish(false);
                  return;
                }
                await session.decrypt(frame.e);
                finish(true);
              } catch {
                finish(false);
              }
            })();
          };

          const request = JSON.stringify({
            jsonrpc: "2.0",
            id: `identity-proof-${Date.now()}`,
            timestamp: Date.now(),
            method: "version",
          });
          openedSocket.send(await session.encryptAndFrame(request));
        })
        .catch(() => finish(false));
    };
    socket.onerror = () => finish(false);
    socket.onclose = () => finish(false);
  });
}

export const proveSavedRecordCredentials: CredentialProofProbe = async (
  urls,
  credentials,
) => {
  for (const url of urls) {
    if (await probeUrl(url, credentials)) return true;
  }
  return false;
};

/**
 * Merge saved aliases only after their endpoint answers with data encrypted by
 * the active record's pairing key. Names and routes merely bound the probe set;
 * successful authenticated decryption is the identity decision.
 */
export async function reconcileCredentialProvenAliases(
  targetRecordId: string,
  credentials: StoredCredentials,
  probe: CredentialProofProbe = proveSavedRecordCredentials,
): Promise<string[]> {
  const initial = deviceRegistry.getSnapshot();
  const target = initial.records[targetRecordId];
  if (!target || initial.activeRecordId !== targetRecordId) return [];

  const candidates = Object.values(initial.records).filter(
    (candidate) =>
      candidate.recordId !== targetRecordId &&
      recordsMayShareIdentity(target, candidate),
  );
  const proofResults = await Promise.all(
    candidates.map(async (candidate) => {
      const urls = resolvedEndpointsForRecord(candidate).map(
        (endpoint) => endpoint.wsUrl,
      );
      return {
        candidateId: candidate.recordId,
        proved: urls.length > 0 && (await probe(urls, credentials)),
      };
    }),
  );

  const mergedIds: string[] = [];
  for (const result of proofResults) {
    if (!result.proved) continue;
    const snapshot = deviceRegistry.getSnapshot();
    if (
      snapshot.activeRecordId !== targetRecordId ||
      !snapshot.records[targetRecordId] ||
      !snapshot.records[result.candidateId]
    ) {
      continue;
    }

    try {
      await deviceRegistry.mergeRecords(targetRecordId, result.candidateId);
      mergedIds.push(result.candidateId);
    } catch (error) {
      logger.error("Failed to merge credential-proven device alias", error, {
        category: "storage",
        action: "mergeCredentialProvenAlias",
        severity: "error",
        targetRecordId,
        sourceRecordId: result.candidateId,
      });
    }
  }

  return mergedIds;
}
