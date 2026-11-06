import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  rate: vi.fn(),
  download: vi.fn(),
  metadata: vi.fn(),
  parseXlsx: vi.fn(),
}));
vi.mock("auth/server", () => ({ getSession: mocks.session }));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rate,
}));
vi.mock("lib/file-storage", () => ({
  serverFileStorage: { download: mocks.download, getMetadata: mocks.metadata },
}));
vi.mock("lib/file-storage/storage-utils", () => ({
  isUserStorageKey: (key: string, userId: string) =>
    key.startsWith(`uploads/${userId}/`),
  storageKeyFromUrl: (url: string) => {
    try {
      return new URL(url).pathname.replace(/^\//, "");
    } catch {
      return null;
    }
  },
}));
vi.mock("lib/file-ingest/xlsx", () => ({ parseXlsxPreview: mocks.parseXlsx }));
vi.mock("lib/logger", () => ({ default: { error: vi.fn() } }));
import { GET } from "./route";

const request = (query: string) =>
  new Request(`https://void.test/api/storage/sheet?${query}`);

describe("GET /api/storage/sheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.rate.mockResolvedValue({ allowed: true });
    mocks.download.mockResolvedValue(Buffer.from("Name,Count\nAlpha,2"));
    mocks.metadata.mockResolvedValue({ size: 20 });
    mocks.parseXlsx.mockResolvedValue({ totalSheets: 1, sheets: [] });
  });

  it("requires authentication and enforces storage ownership before reading", async () => {
    mocks.session.mockResolvedValueOnce(null);
    expect((await GET(request("key=uploads%2Fuser-1%2Fa.csv"))).status).toBe(
      401,
    );
    expect((await GET(request("key=uploads%2Fuser-2%2Fa.csv"))).status).toBe(
      404,
    );
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it("returns a bounded CSV preview with private no-store headers", async () => {
    const response = await GET(request("key=uploads%2Fuser-1%2Ftable.csv"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({
      totalSheets: 1,
      sheets: [{ header: ["Name", "Count"], rows: [["Alpha", "2"]] }],
    });
  });

  it("routes owned XLSX parsing, rejects unsupported files, and enforces byte caps", async () => {
    const xlsx = await GET(request("key=uploads%2Fuser-1%2Fbook.xlsx"));
    expect(xlsx.status).toBe(200);
    expect(mocks.parseXlsx).toHaveBeenCalled();
    expect((await GET(request("key=uploads%2Fuser-1%2Fbook.pdf"))).status).toBe(
      400,
    );
    mocks.download.mockResolvedValueOnce(Buffer.alloc(5 * 1024 * 1024 + 1));
    expect(
      (await GET(request("key=uploads%2Fuser-1%2Flarge.csv"))).status,
    ).toBe(413);
    mocks.metadata.mockResolvedValueOnce({ size: 5 * 1024 * 1024 + 1 });
    expect(
      (await GET(request("key=uploads%2Fuser-1%2Flarge.csv"))).status,
    ).toBe(413);
  });

  it("checks metadata before reading and rejects a missing file", async () => {
    mocks.metadata.mockResolvedValueOnce(null);
    expect(
      (await GET(request("key=uploads%2Fuser-1%2Fmissing.csv"))).status,
    ).toBe(404);
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it("rate limits preview parsing", async () => {
    mocks.rate.mockResolvedValueOnce({ allowed: false });
    expect(
      (await GET(request("key=uploads%2Fuser-1%2Ftable.csv"))).status,
    ).toBe(429);
    expect(mocks.download).not.toHaveBeenCalled();
  });
});
