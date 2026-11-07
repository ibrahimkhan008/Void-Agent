import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  download: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("lib/file-storage", () => ({
  serverFileStorage: { downloadLimited: mocks.download },
}));
vi.mock("logger", () => ({ default: { warn: mocks.warn } }));

import { stageAgentFiles } from "./agent-files";

const workDir = "/home/user/work";

function makeSandbox() {
  const files = new Map<string, string | ArrayBuffer>();
  const sandbox = {
    files: {
      exists: vi.fn(async (path: string) => files.has(path)),
      read: vi.fn(async (path: string) => {
        const value = files.get(path);
        if (value === undefined) throw new Error("missing");
        return value;
      }),
      write: vi.fn(
        async (
          arg: string | Array<{ path: string; data: ArrayBuffer }>,
          data?: string,
        ) => {
          if (typeof arg === "string") {
            files.set(arg, data ?? "");
          } else {
            for (const entry of arg) files.set(entry.path, entry.data);
          }
        },
      ),
      remove: vi.fn(async (path: string) => {
        files.delete(path);
      }),
    },
  };
  return { sandbox, files };
}

describe("stageAgentFiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("downloads and stages only owner-scoped bindings into the configured work directory", async () => {
    const { sandbox, files } = makeSandbox();
    mocks.download.mockResolvedValue(Buffer.from("hello"));
    const result = await stageAgentFiles(
      sandbox as never,
      [
        {
          storageKey: "uploads/alice/report.pdf",
          filename: "../report.pdf",
          ownerId: "alice",
        },
        {
          storageKey: "uploads/bob/private.txt",
          filename: "private.txt",
          ownerId: "alice",
        },
        { storageKey: "uploads/alice/forged.txt", filename: "forged.txt" },
      ],
      workDir,
    );

    expect(result).toEqual({ staged: 1, unavailable: [] });
    expect(mocks.download).toHaveBeenCalledTimes(1);
    expect(mocks.download).toHaveBeenCalledWith(
      "uploads/alice/report.pdf",
      50 * 1024 * 1024,
    );
    expect(files.get(`${workDir}/report.pdf`)).toBeInstanceOf(ArrayBuffer);
  });

  it("is idempotent while staged files exist", async () => {
    const { sandbox } = makeSandbox();
    mocks.download.mockResolvedValue(Buffer.from("hello"));
    const bindings = [
      {
        storageKey: "uploads/alice/a.txt",
        filename: "a.txt",
        ownerId: "alice",
      },
    ];

    await stageAgentFiles(sandbox as never, bindings, workDir);
    const second = await stageAgentFiles(sandbox as never, bindings, workDir);

    expect(second).toEqual({ staged: 0, unavailable: [] });
    expect(mocks.download).toHaveBeenCalledTimes(1);
  });

  it("removes only previously manifested safe names when bindings change", async () => {
    const { sandbox, files } = makeSandbox();
    mocks.download.mockResolvedValue(Buffer.from("new"));
    await stageAgentFiles(
      sandbox as never,
      [
        {
          storageKey: "uploads/alice/old.txt",
          filename: "old.txt",
          ownerId: "alice",
        },
      ],
      workDir,
    );
    files.set(`${workDir}/user-data.txt`, "keep");

    await stageAgentFiles(
      sandbox as never,
      [
        {
          storageKey: "uploads/alice/new.txt",
          filename: "new.txt",
          ownerId: "alice",
        },
      ],
      workDir,
    );

    expect(files.has(`${workDir}/old.txt`)).toBe(false);
    expect(files.has(`${workDir}/new.txt`)).toBe(true);
    expect(files.get(`${workDir}/user-data.txt`)).toBe("keep");
  });

  it("reports over-limit and failed files as unavailable", async () => {
    const { sandbox } = makeSandbox();
    mocks.download
      .mockRejectedValueOnce(new Error("File exceeds the maximum allowed size"))
      .mockRejectedValueOnce(new Error("not found"));
    const result = await stageAgentFiles(
      sandbox as never,
      [
        {
          storageKey: "uploads/alice/large.bin",
          filename: "large.bin",
          ownerId: "alice",
        },
        {
          storageKey: "uploads/alice/missing.bin",
          filename: "missing.bin",
          ownerId: "alice",
        },
      ],
      workDir,
    );

    expect(result).toEqual({
      staged: 0,
      unavailable: ["large.bin", "missing.bin"],
    });
  });
});
