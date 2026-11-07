import path from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { FileNotFoundError } from "lib/errors";
import { generateUUID } from "lib/utils";
import type {
  FileMetadata,
  FileStorage,
  UploadOptions,
  UploadUrl,
  UploadUrlOptions,
} from "./file-storage.interface";
import { assertFileSizeWithinLimit, readStreamWithLimit } from "./limited-download";
import {
  resolveStoragePrefix,
  sanitizeFilename,
  toBuffer,
  validateStorageOwnerId,
} from "./storage-utils";

const required = (name: string, value: string | undefined) => {
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
};

const buildKey = (filename: string, ownerId?: string) => {
  const safeName = sanitizeFilename(filename || "file");
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

const isPrivateS3Mode = () =>
  /^(1|true)$/i.test(process.env.FILE_STORAGE_S3_PRIVATE || "");

const getOwnerFromKey = (key: string): string | null => {
  const root = resolveStoragePrefix();
  const prefix = root ? `${root}/` : "";
  const relative = key.startsWith(prefix) ? key.slice(prefix.length) : key;
  if (!relative.includes("/")) return null;
  const ownerId = relative.split("/", 1)[0];
  return ownerId && /^[A-Za-z0-9_-]{1,128}$/u.test(ownerId) ? ownerId : null;
};

const buildAuthenticatedFileUrl = (key: string) =>
  `/api/files/${key.split("/").map(encodeURIComponent).join("/")}`;

const buildPublicUrl = (
  bucket: string,
  region: string,
  key: string,
  publicBaseUrl?: string,
  endpoint?: string,
  forcePathStyle?: boolean,
) => {
  if (publicBaseUrl) {
    return `${publicBaseUrl.replace(/\/$/, "")}/${encodeURI(key)}`;
  }

  // If custom endpoint provided (e.g., MinIO), fall back to constructing from it
  if (endpoint) {
    const base = endpoint.replace(/\/$/, "");
    if (forcePathStyle) return `${base}/${bucket}/${encodeURI(key)}`;
    try {
      const u = new URL(base);
      return `${u.protocol}//${bucket}.${u.host}/${encodeURI(key)}`;
    } catch {
      return `${base}/${bucket}/${encodeURI(key)}`;
    }
  }

  // AWS standard virtual-hosted–style URL
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodeURI(key)}`;
};

const buildSourceUrl = (
  bucket: string,
  region: string,
  key: string,
  publicBaseUrl?: string,
  endpoint?: string,
  forcePathStyle?: boolean,
) => {
  if (isPrivateS3Mode() && getOwnerFromKey(key)) {
    return buildAuthenticatedFileUrl(key);
  }
  return buildPublicUrl(
    bucket,
    region,
    key,
    publicBaseUrl,
    endpoint,
    forcePathStyle,
  );
};

export const createS3FileStorage = (): FileStorage => {
  const bucket = required(
    "FILE_STORAGE_S3_BUCKET",
    process.env.FILE_STORAGE_S3_BUCKET,
  );
  const region = process.env.FILE_STORAGE_S3_REGION || process.env.AWS_REGION;
  if (!region)
    throw new Error(
      "Missing required env: FILE_STORAGE_S3_REGION or AWS_REGION",
    );
  const endpoint = process.env.FILE_STORAGE_S3_ENDPOINT;
  const forcePathStyle = /^1|true$/i.test(
    process.env.FILE_STORAGE_S3_FORCE_PATH_STYLE || "",
  );
  const publicBaseUrl = process.env.FILE_STORAGE_S3_PUBLIC_BASE_URL;

  // Detect if using Supabase S3 (endpoint contains supabase.co)
  const isSupabase = endpoint?.includes("supabase.co");

  const s3 = new S3Client({
    region,
    endpoint,
    forcePathStyle,
    // Supabase S3 requires credentials to be explicitly provided
    ...(isSupabase &&
      process.env.AWS_ACCESS_KEY_ID && {
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
        },
      }),
  });

  return {
    async upload(content, options: UploadOptions = {}) {
      const buffer = await toBuffer(content);
      const filename = options.filename ?? "file";
      const key = buildKey(filename, options.ownerId);

      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: buffer,
          ContentType: options.contentType,
          ACL: undefined, // rely on bucket policy for public/private
        }),
      );

      const metadata: FileMetadata = {
        key,
        filename: path.posix.basename(key),
        contentType: options.contentType || "application/octet-stream",
        size: buffer.byteLength,
        uploadedAt: new Date(),
      };

      const sourceUrl = buildSourceUrl(
        bucket,
        region,
        key,
        publicBaseUrl,
        endpoint,
        forcePathStyle,
      );

      return { key, sourceUrl, metadata };
    },

    async createUploadUrl(
      options: UploadUrlOptions,
    ): Promise<UploadUrl | null> {
      // Supabase S3 has issues with browser-based presigned URL uploads
      // (Content-Length header handling, CORS). Fall back to server upload.
      if (isSupabase) {
        return null;
      }

      const key = buildKey(options.filename, options.ownerId);
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: options.contentType,
      });
      const expires = Math.max(
        60,
        Math.min(60 * 60 * 12, options.expiresInSeconds ?? 900),
      );

      const url = await getSignedUrl(s3, command, {
        expiresIn: expires,
      });

      return {
        key,
        url,
        method: "PUT",
        expiresAt: new Date(Date.now() + expires * 1000),
        headers: { "Content-Type": options.contentType },
      };
    },

    async download(key) {
      try {
        const res = await s3.send(
          new GetObjectCommand({ Bucket: bucket, Key: key }),
        );
        const body = res.Body;
        if (!body) throw new FileNotFoundError(key);
        const stream = body as unknown as NodeJS.ReadableStream;
        const chunks: Buffer[] = [];
        await new Promise<void>((resolve, reject) => {
          stream.on("data", (c) =>
            chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)),
          );
          stream.once("end", () => resolve());
          stream.once("error", (e) => reject(e));
        });
        return Buffer.concat(chunks);
      } catch (error: unknown) {
        if ((error as any)?.$metadata?.httpStatusCode === 404) {
          throw new FileNotFoundError(key, error);
        }
        throw error;
      }
    },

    async downloadLimited(key, maxBytes) {
      try {
        const metadata = await s3.send(
          new HeadObjectCommand({ Bucket: bucket, Key: key }),
        );
        if (metadata.ContentLength !== undefined) {
          assertFileSizeWithinLimit(metadata.ContentLength, maxBytes);
        }

        const res = await s3.send(
          new GetObjectCommand({ Bucket: bucket, Key: key }),
        );
        if (!res.Body) throw new FileNotFoundError(key);
        // Recheck the GET response to cover object replacement between HEAD and GET.
        if (res.ContentLength !== undefined) {
          assertFileSizeWithinLimit(res.ContentLength, maxBytes);
        }
        return await readStreamWithLimit(
          res.Body as unknown as AsyncIterable<Uint8Array>,
          maxBytes,
        );
      } catch (error: unknown) {
        if ((error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode === 404) {
          throw new FileNotFoundError(key, error as Error);
        }
        throw error;
      }
    },

    async delete(key) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },

    async exists(key) {
      try {
        await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return true;
      } catch (error: unknown) {
        if ((error as any)?.$metadata?.httpStatusCode === 404) return false;
        return false;
      }
    },

    async getMetadata(key) {
      try {
        const res = await s3.send(
          new HeadObjectCommand({ Bucket: bucket, Key: key }),
        );
        return {
          key,
          filename: path.posix.basename(key),
          contentType: res.ContentType || "application/octet-stream",
          size: Number(res.ContentLength || 0),
          uploadedAt: res.LastModified ?? undefined,
        } satisfies FileMetadata;
      } catch (error: unknown) {
        if ((error as any)?.$metadata?.httpStatusCode === 404) return null;
        throw error;
      }
    },

    async getSourceUrl(key) {
      return buildSourceUrl(
        bucket,
        region,
        key,
        publicBaseUrl,
        endpoint,
        forcePathStyle,
      );
    },

    async getDownloadUrl(key) {
      const command = new GetObjectCommand({ Bucket: bucket, Key: key });
      const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
      return url;
    },
  } satisfies FileStorage;
};
