import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("lib/auth/server", () => ({ getSession: vi.fn() }));
vi.mock("lib/db/pg/repositories/cyber-repository.pg", () => ({
  cyberRepository: {},
}));

const { isCyberBootstrapAdmin } = await import("./auth");

describe("isCyberBootstrapAdmin", () => {
  afterEach(() => {
    delete process.env.VOID_CYBER_ADMIN_EMAILS;
  });

  it("allows platform admins", () => {
    expect(isCyberBootstrapAdmin({ role: "admin", email: "a@x.io" })).toBe(
      true,
    );
  });

  it("rejects non-admins when no allowlist is set", () => {
    expect(isCyberBootstrapAdmin({ role: "editor", email: "a@x.io" })).toBe(
      false,
    );
  });

  it("allows allowlisted emails case-insensitively", () => {
    process.env.VOID_CYBER_ADMIN_EMAILS = " Owner@X.io , other@x.io";
    expect(isCyberBootstrapAdmin({ role: "user", email: "owner@x.io" })).toBe(
      true,
    );
    expect(isCyberBootstrapAdmin({ role: "user", email: "nope@x.io" })).toBe(
      false,
    );
    expect(isCyberBootstrapAdmin({ role: "user", email: null })).toBe(false);
  });
});
