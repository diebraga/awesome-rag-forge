import { Entry } from "@napi-rs/keyring";

const SERVICE = "awesome-rag-forge";

const KEYS = [
  "databaseUrl",
  "storageBucket",
  "storageAccessKeyId",
  "storageSecretAccessKey",
  "storageEndpoint",
] as const;

export type SavedConnectionValues = Partial<Record<(typeof KEYS)[number], string>>;

export function saveConnectionValue(key: (typeof KEYS)[number], value: string) {
  new Entry(SERVICE, key).setPassword(value);
}

export function loadSavedConnectionValues(): SavedConnectionValues {
  const values: SavedConnectionValues = {};
  for (const key of KEYS) {
    try {
      // getPassword() returns null (not a throw) when nothing is stored for
      // this key -- only assign when there's a real value, so absent keys
      // stay `undefined` (not `null`) in the returned object.
      const value = new Entry(SERVICE, key).getPassword();
      if (value !== null) values[key] = value;
    } catch {
      // Genuine keychain-access error (e.g. denied access) -- treat the same
      // as "nothing stored," not fatal.
    }
  }
  return values;
}
