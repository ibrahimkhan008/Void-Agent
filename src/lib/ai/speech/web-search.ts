export type VoiceWebSource = {
  id: number;
  title: string;
  url: string;
  author: string;
  publishedDate: string;
  excerpt: string;
};

export type VoiceWebSearchResult = {
  sources: VoiceWebSource[];
  sourceDataIsUntrusted: true;
  instruction: string;
};

/** Same-origin read-only search; no user-supplied URL is sent to the server. */
export async function searchVoiceWeb(
  query: unknown,
): Promise<VoiceWebSearchResult> {
  if (
    typeof query !== "string" ||
    query.trim().length < 2 ||
    query.length > 500
  ) {
    throw new Error("Provide a search phrase between 2 and 500 characters.");
  }
  const response = await fetch("/api/voice/web-search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: query.trim() }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      payload && typeof payload.error === "string"
        ? payload.error
        : "Public web search is temporarily unavailable.",
    );
  }
  if (
    !payload ||
    !Array.isArray(payload.sources) ||
    payload.sourceDataIsUntrusted !== true ||
    typeof payload.instruction !== "string"
  ) {
    throw new Error("Public web search returned an invalid response.");
  }
  return payload as VoiceWebSearchResult;
}
