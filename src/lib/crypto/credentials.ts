import { SecureStorage } from "@aparajita/capacitor-secure-storage";
import { logger } from "../logger";

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
  constructor() {
    void SecureStorage.setKeyPrefix(KEY_PREFIX);
  }

  async get(deviceKey: string): Promise<StoredCredentials | null> {
    try {
      const value = await SecureStorage.get(deviceKey, false);
      if (value == null) return null;
      return value as unknown as StoredCredentials;
    } catch (err) {
      logger.error("SecureStorage.get failed", err, {
        category: "storage",
        action: "getCredentials",
        severity: "error",
      });
      return null;
    }
  }

  async set(deviceKey: string, creds: StoredCredentials): Promise<void> {
    return SecureStorage.set(
      deviceKey,
      creds as unknown as Record<string, unknown>,
    );
  }

  async delete(deviceKey: string): Promise<boolean> {
    return SecureStorage.remove(deviceKey);
  }

  async list(): Promise<
    Array<{ deviceKey: string; creds: StoredCredentials }>
  > {
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
