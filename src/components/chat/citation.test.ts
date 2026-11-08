import type { RetrievedChunk } from "lib/rag/format";
import { describe, expect, it } from "vitest";
import { getCitationSourceHref } from "./citation";

const projectId = "00000000-0000-4000-8000-000000000001";
const itemId = "00000000-0000-4000-8000-000000000002";

function chunk(overrides: Partial<RetrievedChunk> = {}): RetrievedChunk {
  return {
    id: "chunk-1",
    content: "Evidence excerpt",
    position: 0,
    documentId: "document-1",
    collectionItemId: itemId,
    collectionId: "collection-1",
    filename: "plan.pdf",
    sourceUrl: "https://example.test/plan.pdf",
    score: 0.9,
    ...overrides,
  };
}

describe("RAG citation navigation", () => {
  it("uses the authenticated project route only for server-verified project documents", () => {
    expect(
      getCitationSourceHref(
        chunk({ projectId, projectDocumentVerified: true }),
      ),
    ).toBe(`/api/projects/${projectId}/documents/${itemId}/download`);
    expect(
      getCitationSourceHref(
        chunk({ projectId, projectDocumentVerified: false }),
      ),
    ).toBeNull();
    expect(
      getCitationSourceHref(
        chunk({
          projectId,
          projectDocumentVerified: true,
          collectionItemId: "foreign",
        }),
      ),
    ).toBeNull();
  });

  it("allows only credential-free HTTP(S) links outside project citations", () => {
    expect(getCitationSourceHref(chunk())).toBe(
      "https://example.test/plan.pdf",
    );
    expect(
      getCitationSourceHref(chunk({ sourceUrl: "javascript:alert(1)" })),
    ).toBeNull();
    expect(
      getCitationSourceHref(
        chunk({ sourceUrl: "https://user:secret@example.test/file" }),
      ),
    ).toBeNull();
  });
});
