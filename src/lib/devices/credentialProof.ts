import type { StoredCredentials } from "@/lib/crypto/credentials";
import { EncryptedSession } from "@/lib/crypto/session";
import {
  deviceRegistry,
  resolvedEndpointsForRecord,
  type DeviceRecord,
} from "@/lib/devices/deviceRegistry";
import { logger } from "@/lib/logger";

const PROBE_TIMEOUT_MS = 2500;
const PROBE_CONCURRENCY = 3;

export type CredentialProofProbe = (
  urls: readonly string[],
  credentials: StoredCredentials,
) => Promise<boolean>;

function recordsMayShareIdentity(
  target: DeviceRecord,
  candidate: DeviceRecord,
): boolean {
  const targetId = target.discoveryId?.trim().toLowerCase();
  const candidateId = candidate.discoveryId?.trim().toLowerCase();
  return Boolean(targetId && candidateId && targetId === candidateId);
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
 * the active record's pairing key. Probes are restricted to records already
 * linked by the same stable discovery ID so the cleartext auth token is never
 * disclosed based only on a name or mutable network route.
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
  const proofResults: Array<{ candidateId: string; proved: boolean }> = [];
  for (let index = 0; index < candidates.length; index += PROBE_CONCURRENCY) {
    const batch = candidates.slice(index, index + PROBE_CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (candidate) => {
        const urls = resolvedEndpointsForRecord(candidate).map(
          (endpoint) => endpoint.wsUrl,
        );
        return {
          candidateId: candidate.recordId,
          proved: urls.length > 0 && (await probe(urls, credentials)),
        };
      }),
    );
    for (const result of batchResults) proofResults.push(result);
  }

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
      await deviceRegistry.mergeRecords(targetRecordId, result.candidateId, {
        provenCredentials: credentials,
      });
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
