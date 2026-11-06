import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("auth/server", () => ({ getSession: vi.fn().mockResolvedValue(null) }));

const importActions = async () => await import("./actions");

describe("checkStorageAction", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.FILE_STORAGE_TYPE;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.FILE_STORAGE_S3_BUCKET;
    delete process.env.FILE_STORAGE_S3_REGION;
    delete process.env.AWS_REGION;
    delete process.env.VERCEL_BLOB_ACCESS;
    delete process.env.FILE_STORAGE_S3_PRIVATE;
  });

  it("invalid when vercel-blob missing token", async () => {
    process.env.FILE_STORAGE_TYPE = "vercel-blob";
    const { checkStorageAction } = await importActions();
    const res = await checkStorageAction();
    expect(res.isValid).toBe(false);
    expect(res.error).toMatch(/BLOB_READ_WRITE_TOKEN/);
  });

  it("s3 missing config", async () => {
    process.env.FILE_STORAGE_TYPE = "s3";
    const { checkStorageAction } = await importActions();
    const res = await checkStorageAction();
    expect(res.isValid).toBe(false);
    expect(res.error).toMatch(/Missing S3 configuration/);
  });

  it("s3 valid with required envs", async () => {
    process.env.FILE_STORAGE_TYPE = "s3";
    process.env.FILE_STORAGE_S3_BUCKET = "bucket";
    process.env.FILE_STORAGE_S3_REGION = "us-east-1";
    const { checkStorageAction } = await importActions();
    const res = await checkStorageAction();
    expect(res.isValid).toBe(true);
  });

  it("rejects unsupported Vercel Blob access modes", async () => {
    process.env.FILE_STORAGE_TYPE = "vercel-blob";
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
    process.env.VERCEL_BLOB_ACCESS = "semi-private";
    const { checkStorageAction } = await importActions();
    await expect(checkStorageAction()).resolves.toMatchObject({
      isValid: false,
      error: expect.stringContaining("VERCEL_BLOB_ACCESS"),
    });
  });

  it("rejects malformed private S3 mode values", async () => {
    process.env.FILE_STORAGE_TYPE = "s3";
    process.env.FILE_STORAGE_S3_BUCKET = "bucket";
    process.env.FILE_STORAGE_S3_REGION = "us-east-1";
    process.env.FILE_STORAGE_S3_PRIVATE = "sometimes";
    const { checkStorageAction } = await importActions();
    await expect(checkStorageAction()).resolves.toMatchObject({
      isValid: false,
      error: expect.stringContaining("FILE_STORAGE_S3_PRIVATE"),
    });
  });
});
