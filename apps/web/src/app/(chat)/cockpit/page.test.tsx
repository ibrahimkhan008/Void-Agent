import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirectMock } = vi.hoisted(() => ({ redirectMock: vi.fn() }));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import CockpitPage from "./page";

describe("retired Cockpit route", () => {
  beforeEach(() => redirectMock.mockClear());

  it("redirects old bookmarks to Chat", () => {
    CockpitPage();
    expect(redirectMock).toHaveBeenCalledWith("/");
  });
});
