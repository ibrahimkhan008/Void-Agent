import { describe, expect, it, vi } from "vitest";
import { readBoundedRequestBody } from "./bounded-request-body";

describe("readBoundedRequestBody", () => {
  it("returns bodies up to the configured byte limit", async () => {
    const result = await readBoundedRequestBody(
      new Request("http://localhost", { method: "POST", body: "1234" }),
      4,
    );
    expect(new TextDecoder().decode(result!)).toBe("1234");
  });

  it("cancels a stream as soon as it exceeds the limit", async () => {
    const cancel = vi.fn();
    const request = new Request("http://localhost", {
      method: "POST",
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(3));
          controller.enqueue(new Uint8Array(3));
        },
        cancel,
      }),
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    expect(await readBoundedRequestBody(request, 4)).toBeNull();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("rejects invalid limits", async () => {
    await expect(
      readBoundedRequestBody(new Request("http://localhost"), -1),
    ).rejects.toThrow(RangeError);
  });
});
