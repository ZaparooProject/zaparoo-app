import { SecureStorage } from "@aparajita/capacitor-secure-storage";
import { logger } from "@/lib/logger";

const KEY_PREFIX = "zaparoo:creds:";
const DEFAULT_PORT = "7497";

export interface StoredCredentials {
  authToken: string;
  pairingKey: string; // 64 hex chars (32 bytes)
  clientId: string;
  pairedAt: number;
  label?: string;
}

export interface CredentialStore {
  get(deviceKey: string): Promise<StoredCredentials | null>;
  set(deviceKey: string, creds: StoredCredentials): Promise<void>;
  delete(deviceKey: string): Promise<boolean>;
  list(): Promise<Array<{ deviceKey: string; creds: StoredCredentials }>>;
  registerFallback(deviceKey: string, fallbackKey: string): void;
}

// Normalize an address to a stable device key for credential lookup.
// Lowercased host, default port 7497 stripped, trailing slashes removed.
// Ensures equivalent address representations map to the same credential entry.
export function normalizeDeviceKey(address: string): string {
  let s = address.replace(/^wss?:\/\//i, "");
  const slashIdx = s.indexOf("/");
  if (slashIdx !== -1) s = s.slice(0, slashIdx);
  s = s.toLowerCase();
  if (s.endsWith(`:${DEFAULT_PORT}`)) {
    s = s.slice(0, -(DEFAULT_PORT.length + 1));
  }
  return s;
}

export class SecureCredentialStore implements CredentialStore {
  // setKeyPrefix is async; awaiting this in every method ensures no read/write
  // races against an unfinished constructor.
  private readonly initPromise: Promise<void>;
  // Per-device-key operation queue. Guarantees that a delete cannot resolve
  // after a later set on the same key, even when callers fire them in parallel
  // (e.g., removeDeviceHistory + a re-pair flow on the same address).
  private readonly keyLocks = new Map<string, Promise<unknown>>();
  // Network discovery now prefers stable mDNS hostnames, but older app builds
  // stored credentials by IP address. A scan can register the discovered IP as
  // a one-shot fallback before switching to the hostname; get() copies a match
  // to the stable key so subsequent launches no longer need the fallback.
  private readonly fallbackKeys = new Map<string, Set<string>>();

  constructor() {
    this.initPromise = SecureStorage.setKeyPrefix(KEY_PREFIX);
  }

  private enqueue<T>(deviceKey: string, op: () => Promise<T>): Promise<T> {
    const prev = this.keyLocks.get(deviceKey) ?? Promise.resolve();
    // Run `op` after `prev` settles either way; a prior failure must not
    // poison the chain for the next caller.
    const next = prev.then(op, op);
    this.keyLocks.set(
      deviceKey,
      next.catch(() => undefined),
    );
    return next;
  }

  registerFallback(deviceKey: string, fallbackKey: string): void {
    if (deviceKey === fallbackKey) return;
    const keys = this.fallbackKeys.get(deviceKey) ?? new Set<string>();
    keys.add(fallbackKey);
    this.fallbackKeys.set(deviceKey, keys);
  }

  async get(deviceKey: string): Promise<StoredCredentials | null> {
    await this.initPromise;
    return this.enqueue(deviceKey, async () => {
      const fallbackKeys = this.fallbackKeys.get(deviceKey) ?? [];
      this.fallbackKeys.delete(deviceKey);

      try {
        const value = await SecureStorage.get(deviceKey, false);
        if (value != null) {
          return value as unknown as StoredCredentials;
        }

        for (const fallbackKey of fallbackKeys) {
          const fallbackValue = await SecureStorage.get(fallbackKey, false);
          if (fallbackValue == null) continue;

          const credentials = fallbackValue as unknown as StoredCredentials;
          try {
            await SecureStorage.set(
              deviceKey,
              credentials as unknown as Record<string, unknown>,
            );
          } catch (err) {
            // The recovered credentials still work for this connection even if
            // persisting the stable hostname alias fails. Report the migration
            // failure without forcing an unnecessary re-pair.
            logger.error(
              "Failed to migrate credentials to stable device key",
              err,
              {
                category: "storage",
                action: "migrateCredentials",
                severity: "error",
              },
            );
          }
          return credentials;
        }

        return null;
      } catch (err) {
        logger.error("SecureStorage.get failed", err, {
          category: "storage",
          action: "getCredentials",
          severity: "error",
        });
        return null;
      }
    });
  }

  async set(deviceKey: string, creds: StoredCredentials): Promise<void> {
    await this.initPromise;
    return this.enqueue(deviceKey, () =>
      SecureStorage.set(deviceKey, creds as unknown as Record<string, unknown>),
    );
  }

  async delete(deviceKey: string): Promise<boolean> {
    await this.initPromise;
    return this.enqueue(deviceKey, () => SecureStorage.remove(deviceKey));
  }

  async list(): Promise<
    Array<{ deviceKey: string; creds: StoredCredentials }>
  > {
    await this.initPromise;
    const keys = await SecureStorage.keys();
    const results: Array<{ deviceKey: string; creds: StoredCredentials }> = [];
    for (const key of keys) {
      try {
        const value = await SecureStorage.get(key, false);
        if (value != null) {
          results.push({
            deviceKey: key,
            creds: value as unknown as StoredCredentials,
          });
        }
      } catch (err) {
        logger.error("SecureStorage.get failed for key in list()", err, {
          category: "storage",
          action: "listCredentials",
          severity: "error",
        });
      }
    }
    return results;
  }
}

export const credentialStore = new SecureCredentialStore();
