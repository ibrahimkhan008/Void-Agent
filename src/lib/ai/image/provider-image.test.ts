import { describe, expect, it, vi } from "vitest";
import { downloadProviderImage, readProviderJson } from "./provider-image";

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const response = (
  bytes: Uint8Array,
  headers: Record<string, string> = { "content-type": "image/png" },
  status = 200,
) => new Response(Buffer.from(bytes), { status, headers });

describe("downloadProviderImage", () => {
  it("downloads only a signature-verified image from the configured HTTPS origin", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(png));
    const image = await downloadProviderImage(
      "https://api.flare-sh.tech/generated/image.png",
      "https://api.flare-sh.tech",
      { fetcher: fetcher as typeof fetch },
    );

    expect(image).toEqual({
      base64: Buffer.from(png).toString("base64"),
      mimeType: "image/png",
    });
    expect(fetcher).toHaveBeenCalledWith(
      new URL("https://api.flare-sh.tech/generated/image.png"),
      expect.objectContaining({
        redirect: "error",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      }),
    );
  });

  it.each([
    "http://api.flare-sh.tech/generated/image.png",
    "https://evil.example/generated/image.png",
    "https://user:password@api.flare-sh.tech/generated/image.png",
  ])(
    "rejects untrusted provider URL %s before making a request",
    async (url) => {
      const fetcher = vi.fn();
      await expect(
        downloadProviderImage(url, "https://api.flare-sh.tech", {
          fetcher: fetcher as typeof fetch,
        }),
      ).rejects.toThrow("untrusted image URL");
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it("rejects redirects and mismatched content types or signatures", async () => {
    const redirect = vi
      .fn()
      .mockResolvedValue(response(new Uint8Array(), {}, 302));
    await expect(
      downloadProviderImage(
        "https://api.flare-sh.tech/image.png",
        "https://api.flare-sh.tech",
        { fetcher: redirect as typeof fetch },
      ),
    ).rejects.toThrow("request failed");
    expect(redirect.mock.calls[0]?.[1]).toMatchObject({ redirect: "error" });

    const wrongMime = vi
      .fn()
      .mockResolvedValue(response(png, { "content-type": "image/jpeg" }));
    await expect(
      downloadProviderImage(
        "https://api.flare-sh.tech/image.png",
        "https://api.flare-sh.tech",
        { fetcher: wrongMime as typeof fetch },
      ),
    ).rejects.toThrow("signature");
  });

  it("rejects declared and streamed responses over the byte limit", async () => {
    const declared = vi.fn().mockResolvedValue(
      response(png, {
        "content-type": "image/png",
        "content-length": String(15 * 1024 * 1024 + 1),
      }),
    );
    await expect(
      downloadProviderImage(
        "https://api.flare-sh.tech/image.png",
        "https://api.flare-sh.tech",
        { fetcher: declared as typeof fetch },
      ),
    ).rejects.toThrow("byte limit");
  });

  it("propagates caller cancellation to the provider image request", async () => {
    const caller = new AbortController();
    const fetcher = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true },
          );
        }),
    );
    const pending = downloadProviderImage(
      "https://api.flare-sh.tech/image.png",
      "https://api.flare-sh.tech",
      { fetcher: fetcher as typeof fetch, signal: caller.signal },
    );

    caller.abort(new Error("user cancelled"));
    await expect(pending).rejects.toThrow("user cancelled");
    expect(fetcher).toHaveBeenCalledOnce();
  });
});

describe("readProviderJson", () => {
  it("parses bounded provider JSON and rejects an oversized declared body", async () => {
    await expect(
      readProviderJson<{ ok: boolean }>(
        new Response('{"ok":true}', {
          headers: { "content-type": "application/json" },
        }),
      ),
    ).resolves.toEqual({ ok: true });
    await expect(
      readProviderJson(
        new Response("{}", {
          headers: {
            "content-length": String(10),
            "content-type": "application/json",
          },
        }),
        5,
      ),
    ).rejects.toThrow("byte limit");
  });
});
