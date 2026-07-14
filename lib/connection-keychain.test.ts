import { afterEach, describe, expect, test } from "vitest";
import { Entry } from "@napi-rs/keyring";
import { loadSavedConnectionValues, saveConnectionValue } from "./connection-keychain";

const KEYS = ["databaseUrl", "storageBucket", "storageAccessKeyId", "storageSecretAccessKey", "storageEndpoint"] as const;

afterEach(() => {
  for (const key of KEYS) {
    try {
      new Entry("awesome-rag-forge", key).deletePassword();
    } catch {
      // Nothing saved for this key -- fine, that's what we're cleaning up toward.
    }
  }
});

describe("connection keychain", () => {
  test("round-trips a saved value", () => {
    saveConnectionValue("databaseUrl", "postgresql://user:pass@localhost:5432/db");
    const values = loadSavedConnectionValues();
    expect(values.databaseUrl).toBe("postgresql://user:pass@localhost:5432/db");
  });

  test("keys with no saved value are simply absent, not an error", () => {
    const values = loadSavedConnectionValues();
    expect(values.storageBucket).toBeUndefined();
  });

  test("saving one key does not affect the others", () => {
    saveConnectionValue("storageBucket", "my-bucket");
    const values = loadSavedConnectionValues();
    expect(values.storageBucket).toBe("my-bucket");
    expect(values.databaseUrl).toBeUndefined();
  });
});
