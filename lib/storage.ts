const REQUIRED_STORAGE_ENV_VARS = [
  "STORAGE_BUCKET",
  "STORAGE_ACCESS_KEY_ID",
  "STORAGE_SECRET_ACCESS_KEY",
] as const;

export const STORAGE_NOT_CONFIGURED_MESSAGE =
  "Document storage is not configured. Add bucket/storage environment variables before uploading files.";

export function isStorageConfigured() {
  return REQUIRED_STORAGE_ENV_VARS.every((key) => Boolean(process.env[key]));
}

export function assertStorageConfigured() {
  if (!isStorageConfigured()) {
    throw new Error(STORAGE_NOT_CONFIGURED_MESSAGE);
  }
}
