"use server";

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { upsertEnvVar } from "@/scripts/env-file";
import { canSimulateDisconnect, setDevDisconnectSimulated } from "@/lib/dev-disconnect";
import { saveConnectionValue, type SavedConnectionValues } from "@/lib/connection-keychain";

export type ConnectResult = { ok: true } | { ok: false; error: string };

const OPTIONAL_FIELDS: Array<{ formKey: keyof SavedConnectionValues; envKey: string }> = [
  { formKey: "storageBucket", envKey: "STORAGE_BUCKET" },
  { formKey: "storageAccessKeyId", envKey: "STORAGE_ACCESS_KEY_ID" },
  { formKey: "storageSecretAccessKey", envKey: "STORAGE_SECRET_ACCESS_KEY" },
  { formKey: "storageEndpoint", envKey: "STORAGE_ENDPOINT" },
];

export async function connectDatabaseAction(formData: FormData): Promise<ConnectResult> {
  if (!canSimulateDisconnect()) {
    return { ok: false, error: "Configuring the database from the UI is only available outside production." };
  }

  const databaseUrl = String(formData.get("databaseUrl") ?? "").trim();
  if (!databaseUrl) {
    return { ok: false, error: "Enter a Database URL." };
  }

  const envPath = join(process.cwd(), ".env");
  let current = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
  current = upsertEnvVar(current, "DATABASE_URL", databaseUrl);
  saveConnectionValue("databaseUrl", databaseUrl);

  for (const { formKey, envKey } of OPTIONAL_FIELDS) {
    const value = String(formData.get(formKey) ?? "").trim();
    if (!value) continue;
    current = upsertEnvVar(current, envKey, value);
    saveConnectionValue(formKey, value);
  }

  writeFileSync(envPath, current);
  process.env.DATABASE_URL = databaseUrl;

  // Submitting this form is an explicit "connect me" action -- it must
  // override any simulated-disconnect state left on from the header's
  // Disconnect button (a toggle, not a one-way switch), or a real
  // DATABASE_URL would never be able to un-stick the gate once a user had
  // ever clicked Disconnect. Found via manual verification: the gate stayed
  // up indefinitely after a valid reconnect attempt until this was added.
  setDevDisconnectSimulated(false);

  return { ok: true };
}
