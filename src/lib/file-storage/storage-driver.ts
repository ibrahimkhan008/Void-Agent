export type FileStorageDriver = "vercel-blob" | "s3" | "local";

export const resolveDriver = (): FileStorageDriver => {
  const candidate = process.env.FILE_STORAGE_TYPE;

  const normalized = candidate?.trim().toLowerCase();
  if (
    normalized === "vercel-blob" ||
    normalized === "s3" ||
    normalized === "local"
  ) {
    return normalized;
  }

  // Auto-select: if no Vercel Blob token is configured, fall back to on-disk
  // local storage so self-hosted deployments work without any cloud provider.
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return "local";
  }

  // Default to Vercel Blob
  return "vercel-blob";
};

export const storageDriver = resolveDriver();
