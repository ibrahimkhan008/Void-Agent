import { describe, expect, it } from "vitest";
import { withPrivateNoStore } from "./with-private-no-store";

describe("withPrivateNoStore", () => {
  it("sets the private no-store policy on successful and error responses", async () => {
    const handler = withPrivateNoStore(async (status: number) =>
      Response.json({ ok: status === 200 }, { status }),
    );

    for (const status of [200, 401, 404, 502]) {
      const response = await handler(status);
      expect(response.status).toBe(status);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
  });
});
