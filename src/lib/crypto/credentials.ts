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

export interface RecordCredentialLookup {
  credentials: StoredCredentials | null;
  /**
   * The pre-V2 key that answered, when the canonical key had nothing. The
   * caller needs this to know a migration is still outstanding, and which key
   * the peer is about to prove ownership of.
   */
  legacyKeyUsed: string | null;
}

export interface CredentialStore {
  get(deviceKey: string): Promise<StoredCredentials | null>;
  set(deviceKey: string, creds: StoredCredentials): Promise<void>;
  delete(deviceKey: string): Promise<boolean>;
  list(): Promise<Array<{ deviceKey: string; creds: StoredCredentials }>>;
  getForRecord(
    recordId: string,
    legacyKey?: string,
  ): Promise<RecordCredentialLookup>;
  promoteRecordCredentials(
    recordId: string,
    legacyKey: string,
  ): Promise<boolean>;
}

/**
 * The pre-V2 credential key for an address: lowercased host, default port
 * stripped, scheme and path removed.
 *
 * Kept byte-for-byte as it was before device records existed. It no longer
 * names where credentials are written — that is `credentialKeyForRecord` — but
 * it still has to reproduce exactly what older builds wrote, or the migration
 * looks in the wrong place and every existing user is asked to pair again.
 */
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

/** The canonical key for a device record. Addresses never key credentials. */
export function credentialKeyForRecord(recordId: string): string {
  return `record:${recordId}`;
}

/**
 * Secure storage hands back whatever was written, and a partially written or
 * hand-edited entry would otherwise reach the handshake as a credential object
 * with undefined fields, failing as an opaque protocol error rather than as a
 * missing pairing.
 */
function isStoredCredentials(value: unknown): value is StoredCredentials {
  if (typeof value !== "object" || value === null) return false;
  const credentials = value as Partial<StoredCredentials>;
  return (
    typeof credentials.authToken === "string" &&
    credentials.authToken.length > 0 &&
    typeof credentials.pairingKey === "string" &&
    credentials.pairingKey.length > 0 &&
    credentials.pairingKey.length % 2 === 0 &&
    /^[0-9a-f]+$/i.test(credentials.pairingKey) &&
    typeof credentials.clientId === "string" &&
    credentials.clientId.length > 0 &&
    typeof credentials.pairedAt === "number" &&
    Number.isFinite(credentials.pairedAt)
  );
}

export class SecureCredentialStore implements CredentialStore {
  // setKeyPrefix is async; awaiting this in every method ensures no read/write
  // races against an unfinished constructor.
  private readonly initPromise: Promise<void>;
  // Per-device-key operation queue. Guarantees that a delete cannot resolve
  // after a later set on the same key, even when callers fire them in parallel
  // (e.g., forgetting a record while a new pairing completes).
  private readonly keyLocks = new Map<string, Promise<unknown>>();

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

  async get(deviceKey: string): Promise<StoredCredentials | null> {
    await this.initPromise;
    return this.enqueue(deviceKey, async () => {
      try {
        const value = await SecureStorage.get(deviceKey, false);
        return isStoredCredentials(value) ? value : null;
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

  /**
   * Read a record's credentials, falling back to the pre-V2 address key it was
   * imported with. Purely a read: promotion is deferred to
   * `promoteRecordCredentials` so nothing is rewritten until the peer has
   * actually accepted what was found.
   */
  async getForRecord(
    recordId: string,
    legacyKey?: string,
  ): Promise<RecordCredentialLookup> {
    const canonicalKey = credentialKeyForRecord(recordId);
    const canonical = await this.get(canonicalKey);
    if (canonical) return { credentials: canonical, legacyKeyUsed: null };

    if (!legacyKey || legacyKey === canonicalKey) {
      return { credentials: null, legacyKeyUsed: null };
    }

    const legacy = await this.get(legacyKey);
    return legacy
      ? { credentials: legacy, legacyKeyUsed: legacyKey }
      : { credentials: null, legacyKeyUsed: null };
  }

  /**
   * Settle a record's outstanding migration, and report whether it is settled.
   *
   * Call only after the peer has accepted the credentials, so a rejected or
   * stale pairing is never copied onto the canonical key. Returns false when
   * storage misbehaved and the record should keep its legacy key for another
   * attempt; a false negative costs one extra read next connect, whereas
   * deleting on an unverified write costs the user their pairing.
   */
  async promoteRecordCredentials(
    recordId: string,
    legacyKey: string,
  ): Promise<boolean> {
    const canonicalKey = credentialKeyForRecord(recordId);
    if (canonicalKey === legacyKey) return true;

    try {
      // Anything already at the canonical key supersedes the legacy copy. The
      // legacy entry is left in place rather than deleted: a record created
      // from a scan and one typed by hand can share an address-derived key, and
      // this record re-pairing is no reason to strand the other one.
      if (await this.get(canonicalKey)) return true;

      const legacy = await this.get(legacyKey);
      if (!legacy) return true;

      await this.set(canonicalKey, legacy);
      // Read back before dropping the only other copy. A write that resolved
      // but did not persist would otherwise take the pairing with it.
      if (!(await this.get(canonicalKey))) return false;

      await this.delete(legacyKey);
      return true;
    } catch (err) {
      logger.error("Failed to migrate credentials to record key", err, {
        category: "storage",
        action: "promoteRecordCredentials",
        severity: "error",
      });
      return false;
    }
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
        if (isStoredCredentials(value)) {
          results.push({ deviceKey: key, creds: value });
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
