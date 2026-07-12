import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

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

let cachedClient: S3Client | null = null;

// S3-compatible: works against real AWS S3 (leave STORAGE_ENDPOINT unset) or
// any S3-compatible provider like Cloudflare R2/MinIO (set STORAGE_ENDPOINT).
function getStorageClient() {
  assertStorageConfigured();
  if (!cachedClient) {
    cachedClient = new S3Client({
      region: process.env.STORAGE_REGION || "auto",
      endpoint: process.env.STORAGE_ENDPOINT || undefined,
      credentials: {
        accessKeyId: process.env.STORAGE_ACCESS_KEY_ID!,
        secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY!,
      },
    });
  }
  return cachedClient;
}

export type StorageConnectionStatus =
  | { ok: true }
  | { ok: false; reason: "missing" | "connection"; error: string };

// Status-only, like getDatabaseConnectionStatus in lib/database-health.ts —
// reports connected/failed, never the underlying bucket name or credentials.
// This is what lets an AI assistant verify storage setup without ever
// reading STORAGE_* values itself; see scripts/check-env.ts.
export async function getStorageConnectionStatus(): Promise<StorageConnectionStatus> {
  if (!isStorageConfigured()) {
    return { ok: false, reason: "missing", error: STORAGE_NOT_CONFIGURED_MESSAGE };
  }

  try {
    const client = getStorageClient();
    await client.send(new HeadBucketCommand({ Bucket: process.env.STORAGE_BUCKET! }));
    return { ok: true };
  } catch {
    return {
      ok: false,
      reason: "connection",
      error:
        "Unable to reach the configured storage bucket. Check STORAGE_BUCKET, STORAGE_ACCESS_KEY_ID, STORAGE_SECRET_ACCESS_KEY, STORAGE_REGION, and STORAGE_ENDPOINT.",
    };
  }
}

export async function uploadFileToStorage(key: string, body: Buffer, contentType: string) {
  const client = getStorageClient();
  await client.send(
    new PutObjectCommand({
      Bucket: process.env.STORAGE_BUCKET!,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function deleteFileFromStorage(key: string) {
  const client = getStorageClient();
  await client.send(
    new DeleteObjectCommand({
      Bucket: process.env.STORAGE_BUCKET!,
      Key: key,
    }),
  );
}

// Short-lived so a leaked/cached URL can't serve the file indefinitely;
// the bucket itself stays private (no public-read config needed).
const DOWNLOAD_URL_EXPIRY_SECONDS = 300;

export async function getDownloadUrl(key: string) {
  const client = getStorageClient();
  const command = new GetObjectCommand({
    Bucket: process.env.STORAGE_BUCKET!,
    Key: key,
  });
  return getSignedUrl(client, command, { expiresIn: DOWNLOAD_URL_EXPIRY_SECONDS });
}
