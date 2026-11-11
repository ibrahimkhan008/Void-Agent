import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

vi.mock("electron", () => ({
  net: { fetch: mocks.fetch },
  BrowserWindow: { fromWebContents: vi.fn() },
  app: {},
  dialog: { showErrorBox: vi.fn() },
  ipcMain: { handle: vi.fn() },
}));

import { checkServer } from "./server-picker.js";

function response(input: {
  status: number;
  body: string;
  contentType?: string;
  url?: string;
}) {
  const result = new Response(input.body, {
    status: input.status,
    headers: {
      "content-type": input.contentType ?? "application/json",
    },
  });
  Object.defineProperty(result, "url", {
    value: input.url ?? "https://server.example/api/auth/ok",
  });
  return result;
}

describe("desktop server picker network check", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does an unauthenticated, redirect-blocking, bounded same-origin check", async () => {
    mocks.fetch.mockResolvedValueOnce(
      response({ status: 200, body: JSON.stringify({ ok: true }) }),
    );

    await expect(checkServer("https://server.example")).resolves.toEqual({
      ok: true,
    });
    expect(mocks.fetch).toHaveBeenCalledWith(
      "https://server.example/api/auth/ok",
      expect.objectContaining({
        method: "GET",
        credentials: "omit",
        redirect: "manual",
        headers: { accept: "application/json" },
      }),
    );
  });

  it("rejects redirects, cross-origin responses, and incompatible payloads", async () => {
    mocks.fetch
      .mockResolvedValueOnce(
        response({
          status: 302,
          body: JSON.stringify({ ok: true }),
        }),
      )
      .mockResolvedValueOnce(
        response({
          status: 200,
          body: JSON.stringify({ ok: true }),
          url: "https://attacker.example/api/auth/ok",
        }),
      )
      .mockResolvedValueOnce(
        response({ status: 200, body: JSON.stringify({ ok: false }) }),
      );

    await expect(checkServer("https://server.example")).resolves.toEqual({
      ok: false,
      reason: "not-navigator",
    });
    await expect(checkServer("https://server.example")).resolves.toEqual({
      ok: false,
      reason: "not-navigator",
    });
    await expect(checkServer("https://server.example")).resolves.toEqual({
      ok: false,
      reason: "not-navigator",
    });
  });
});
