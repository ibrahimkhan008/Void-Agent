import path from "node:path";
import { del, get, head, put } from "@vercel/blob";
import { FileNotFoundError } from "lib/errors";
import { generateUUID } from "lib/utils";
import type {
  FileMetadata,
  FileStorage,
  UploadOptions,
} from "./file-storage.interface";
import {
  resolveStoragePrefix,
  sanitizeFilename,
  toBuffer,
  validateStorageOwnerId,
} from "./storage-utils";

const buildPathname = (filename: string, ownerId?: string) => {
  const safeName = sanitizeFilename(filename);
  const id = generateUUID();
  const configuredPrefix = resolveStoragePrefix();
  const prefix = configuredPrefix ? `${configuredPrefix}/` : "";
  const owner = ownerId ? validateStorageOwnerId(ownerId) : null;
  return path.posix.join(
    prefix,
    ...(owner ? [owner] : []),
    `${id}-${safeName}`,
  );
};

const mapMetadata = (
  key: string,
  info: { contentType: string; size: number; uploadedAt?: Date },
) =>
  ({
    key,
    filename: path.posix.basename(key),
    contentType: info.contentType,
    size: info.size,
    uploadedAt: info.uploadedAt,
  }) satisfies FileMetadata;

const getHeadForKey = async (key: string) => {
  try {
    return await head(key);
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "BlobNotFoundError") {
      throw new FileNotFoundError(key, error);
    }
    throw error;
  }
};

const fetchSourceBuffer = async (url: string) => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    if (response.status === 404) {
      throw new FileNotFoundError(url);
    }
    throw new Error(`Failed to download blob. Status: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
};

const getBlobAccess = (): "public" | "private" => {
  const configured = process.env.VERCEL_BLOB_ACCESS?.trim().toLowerCase();
  if (!configured || configured === "public") return "public";
  if (configured === "private") return "private";
  throw new Error("VERCEL_BLOB_ACCESS must be either 'public' or 'private'");
};

export const createVercelBlobStorage = (): FileStorage => {
  return {
    async upload(content, options: UploadOptions = {}) {
      const buffer = await toBuffer(content);
      const filename = options.filename ?? "file";
      const pathname = buildPathname(filename, options.ownerId);
      const access = getBlobAccess();

      const result = await put(pathname, buffer, {
        access,
        contentType: options.contentType,
      });

      const metadata: FileMetadata = {
        key: result.pathname,
        filename: path.posix.basename(result.pathname),
        contentType: result.contentType,
        size: buffer.byteLength,
        uploadedAt: new Date(),
      };

      return {
        key: result.pathname,
        sourceUrl: result.url,
        metadata,
      };
    },

    // Vercel Blob uses handleUpload flow instead of createUploadUrl
    // Client should use @vercel/blob/client with handleUploadUrl: "/api/storage/upload-url"
    async createUploadUrl() {
      return null;
    },

    async download(key) {
      const info = await getHeadForKey(key);
      if (getBlobAccess() === "private") {
        const result = await get(key, { access: "private", useCache: false });
        if (!result || result.statusCode !== 200 || !result.stream) {
          throw new FileNotFoundError(key);
        }
        return Buffer.from(await new Response(result.stream).arrayBuffer());
      }
      return fetchSourceBuffer(info.url);
    },

    async delete(key) {
      await del(key);
    },

    async exists(key) {
      try {
        await getHeadForKey(key);
        return true;
      } catch (error: unknown) {
        if (error instanceof FileNotFoundError) {
          return false;
        }
        throw error;
      }
    },

    async getMetadata(key) {
      try {
        const info = await getHeadForKey(key);
        return mapMetadata(key, {
          contentType: info.contentType,
          size: info.size,
          uploadedAt: info.uploadedAt,
        });
      } catch (error: unknown) {
        if (error instanceof FileNotFoundError) {
          return null;
        }
        throw error;
      }
    },

    async getSourceUrl(key) {
      try {
        const info = await getHeadForKey(key);
        return info.url;
      } catch (error: unknown) {
        if (error instanceof FileNotFoundError) {
          return null;
        }
        throw error;
      }
    },

    async getDownloadUrl(key) {
      try {
        const info = await getHeadForKey(key);
        return info.downloadUrl ?? info.url;
      } catch (error: unknown) {
        if (error instanceof FileNotFoundError) {
          return null;
        }
        throw error;
      }
    },
  } satisfies FileStorage;
};
