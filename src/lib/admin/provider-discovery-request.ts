export function createProviderDiscoveryRequest(
  baseURL: string,
  apiKey?: string,
): { url: string; init: RequestInit } {
  return {
    url: "/api/admin/providers/discover",
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseURL, apiKey: apiKey || undefined }),
    },
  };
}
