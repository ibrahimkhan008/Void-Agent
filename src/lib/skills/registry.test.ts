import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchRegistrySkill, searchSkillsRegistry } from "./registry";

vi.mock("server-only", () => ({}));

const response = (body: string, status = 200) =>
  new Response(body, {
    status,
    headers: { "content-type": "application/json" },
  });

describe("skills registry", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("normalizes search results and drops invalid source/slug metadata", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(
        JSON.stringify({
          skills: [
            {
              skillId: "react",
              name: "React",
              source: "vercel-labs/skills",
              installs: 8,
            },
            {
              skillId: "../../secrets",
              name: "Bad",
              source: "vercel-labs/skills",
              installs: 99,
            },
            {
              skillId: "unsafe",
              name: "Bad source",
              source: "owner/repo/extra",
              installs: 100,
            },
          ],
        }),
      ),
    );

    await expect(searchSkillsRegistry("react")).resolves.toEqual([
      { id: "react", name: "React", source: "vercel-labs/skills", installs: 8 },
    ]);
    const requested = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requested.origin).toBe("https://skills.sh");
    expect(requested.searchParams.get("q")).toBe("react");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: "error" });
  });

  it("only imports repository content with a recognized permissive license", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("api.github.com")) {
          return response(
            JSON.stringify({
              license: { spdx_id: "MIT" },
              content: Buffer.from(
                "MIT License\nCopyright (c) Example",
              ).toString("base64"),
              encoding: "base64",
            }),
          );
        }
        if (url.endsWith("/skills/react/SKILL.md")) {
          return new Response(
            "---\nname: React Guide\ndescription: React help\n---\nUse concise examples.",
          );
        }
        return new Response("not found", { status: 404 });
      });

    await expect(
      fetchRegistrySkill("vercel-labs/skills", "react"),
    ).resolves.toMatchObject({
      name: "React Guide",
      description: "React help",
      markdown: "Use concise examples.",
      license: "MIT",
      licenseNotice: "MIT License\nCopyright (c) Example",
      source: "vercel-labs/skills",
    });
    expect(
      fetchMock.mock.calls.every(([, init]) => init?.redirect === "error"),
    ).toBe(true);
  });

  it("rejects repositories without an approved SPDX license", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(JSON.stringify({ license: { spdx_id: "NOASSERTION" } })),
    );
    await expect(
      fetchRegistrySkill("owner/repo", "skill"),
    ).rejects.toMatchObject({
      status: 422,
    });
  });

  it("rejects unsafe sources and path traversal before network access", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(
      fetchRegistrySkill("127.0.0.1/private", "skill"),
    ).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      fetchRegistrySkill("owner/repo", "../secret"),
    ).rejects.toMatchObject({
      status: 400,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("bounds untrusted registry response bytes", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(512_001));
        controller.close();
      },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(body));
    await expect(searchSkillsRegistry("large")).rejects.toMatchObject({
      status: 502,
      message: "Registry response is too large.",
    });
  });
});
