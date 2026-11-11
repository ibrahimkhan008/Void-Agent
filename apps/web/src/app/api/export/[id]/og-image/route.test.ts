import { beforeEach, describe, expect, it, vi } from "vitest";

// og-image route test (ported zip-main route): next/og is mocked so the
// render-only ImageResponse constructor is not invoked for real.
const mocks = vi.hoisted(() => ({
  repo: {
    selectByIdWithUser: vi.fn(),
    isExpired: vi.fn(),
  },
  imageResponses: [] as Array<{ element: unknown; options: unknown }>,
}));

vi.mock("next/og", () => ({
  ImageResponse: class {
    constructor(element: unknown, options: unknown) {
      mocks.imageResponses.push({ element, options });
    }
  },
}));

vi.mock("lib/db/repository", () => ({
  chatExportRepository: mocks.repo,
}));

vi.mock("server-only", () => ({}));

import { GET } from "./route";

const exportRow = {
  id: "exp-1",
  title: "Trip planning",
  exporterName: "Ada",
  messages: [
    { role: "user", parts: [{ type: "text", text: "Plan a trip to Rome" }] },
    {
      role: "assistant",
      parts: [{ type: "text", text: "Here is a three day itinerary." }],
    },
  ],
};

const call = () =>
  GET(new Request("http://localhost/api/export/exp-1/og-image"), {
    params: Promise.resolve({ id: "exp-1" }),
  });

const elementText = (element: unknown): string => {
  if (typeof element === "string") return element;
  if (Array.isArray(element)) return element.map(elementText).join("");
  if (element && typeof element === "object") {
    const el = element as { type?: unknown; props?: { children?: unknown } };
    // Render function components (ExportOgImage / ExportOgFallback) so the
    // test can assert against the final markup text.
    if (typeof el.type === "function") {
      return elementText((el.type as (props: unknown) => unknown)(el.props));
    }
    if (el.props?.children !== undefined) return elementText(el.props.children);
  }
  return "";
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.imageResponses.length = 0;
  mocks.repo.isExpired.mockResolvedValue(false);
});

describe("GET /api/export/[id]/og-image", () => {
  it("renders the share card with clamped title, author, and excerpts", async () => {
    mocks.repo.selectByIdWithUser.mockResolvedValue(exportRow);

    await call();

    expect(mocks.imageResponses).toHaveLength(1);
    const { element, options } = mocks.imageResponses[0];
    expect(options).toEqual({ width: 1200, height: 630 });
    const text = elementText(element);
    expect(text).toContain("Trip planning");
    expect(text).toContain("Shared by Ada");
    expect(text).toContain("Plan a trip to Rome");
    expect(text).toContain("Here is a three day itinerary.");
    expect(text).toContain("Void-Agent");
  });

  it("renders the not-found fallback for a missing export", async () => {
    mocks.repo.selectByIdWithUser.mockResolvedValue(null);

    await call();

    const text = elementText(mocks.imageResponses[0].element);
    expect(text).toContain("Shared chat not found");
    expect(mocks.repo.isExpired).not.toHaveBeenCalled();
  });

  it("renders the expired fallback without message text", async () => {
    mocks.repo.selectByIdWithUser.mockResolvedValue(exportRow);
    mocks.repo.isExpired.mockResolvedValue(true);

    await call();

    const text = elementText(mocks.imageResponses[0].element);
    expect(text).toContain("Trip planning");
    expect(text).toContain("This exported chat link has expired.");
    expect(text).not.toContain("Plan a trip to Rome");
  });

  it("renders the generic fallback when the repository throws", async () => {
    mocks.repo.selectByIdWithUser.mockRejectedValue(new Error("db down"));

    await call();

    const text = elementText(mocks.imageResponses[0].element);
    expect(text).toContain("Shared chat preview");
  });
});
