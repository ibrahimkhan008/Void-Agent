# Voice web search (safe browser equivalent)

Voice sessions can call `searchWeb` for public web research. It calls the app's configured Exa/SearXNG search provider with a bounded query and returns up to five public citation URLs with short excerpts. The route accepts a query only; it cannot open user-supplied URLs, navigate, click, type, sign in, or change a website. Results are untrusted source data and must not be followed as instructions.

The route requires a signed-in same-origin session, applies a per-user rate limit, bounds the request, forwards cancellation with a 12-second timeout, filters invalid/local/private-address citation URLs, and returns no-store responses. It performs no direct fetch of the returned pages.

## ElevenLabs setup

The ElevenLabs SDK requires client tools to be registered in the configured conversational agent's dashboard. Add a blocking client tool named `searchWeb` with this schema, so the model waits for the search result:

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "A concise public web search phrase."
    }
  },
  "required": ["query"],
  "additionalProperties": false
}
```

The client tool calls the authenticated same-origin `/api/voice/web-search` route; no search-provider key belongs in the dashboard.

## B20 browser automation remains missing

This read-only search is a separate workflow, not a browser automation implementation. The Better Chatbot voice browser workflow relies on its Kernel browser, credential vault, organization policy/credit gate, abortable streamed run lifecycle, and read-only live view. Void Agent's available Steel/Crawl/Cloak browser tools do not provide equivalent isolated egress or credential-policy lifecycle: the Steel action loop can follow redirects, navigate to arbitrary URLs, interact with forms, retain thread sessions, and expose an interactive viewer. Exposing it to voice without network-level private-address/redirect controls and a reviewed prompt-injection boundary would risk SSRF and unapproved actions. Keep B20 MISSING until that infrastructure and end-to-end cancellation/cleanup verification exist.

## Verification

```sh
pnpm test -- src/app/api/voice/web-search/route.test.ts src/lib/ai/speech/web-search.test.ts src/lib/ai/speech/voice-tools.test.ts
```
