# Optional Agentset project search

Void-Agent keeps its local PostgreSQL/pgvector retrieval as the default. A separate authenticated project search endpoint can query an explicitly provisioned Agentset namespace when both `AGENTSET_API_KEY` and `AGENTSET_PROJECT_SEARCH_ENABLED=true` are set. The adapter does not change chat retrieval, local ingestion, project-brain retrieval, or project source review behavior.

## Reference contract

The Better Chatbot reference uses the `agentset@1.9.1` SDK. It resolves a project namespace, then calls `namespace.search(query, { topK, rerank, rerankLimit, minScore, mode, includeMetadata })`. Void-Agent pins that SDK version and bounds its injected fetcher to `https://api.agentset.ai`, GET/POST requests, a five-second timeout, an 8 KiB request body, and a 1 MB response body.

## Enablement and namespace setup

1. Create an Agentset namespace for the target project using the slug `void-project-` plus the first 32 lowercase hex characters of `SHA-256(projectId)`.
2. Index only project sources that are still attached and ready in Void-Agent. Every indexed result must include these metadata values: `projectId`, `ownerUserId` (the source collection's owner), `collectionId`, `collectionItemId`, `documentId`, `filename`, and `sourceStatus: "ready"`.
3. Set the server-side `AGENTSET_API_KEY` and `AGENTSET_PROJECT_SEARCH_ENABLED=true`.
4. Call `POST /api/projects/{projectId}/search` with `{ "query": "...", "limit": 5 }` from the authenticated same-origin application.

The route resolves project membership itself. It does not accept a namespace ID or owner ID from the client. The namespace slug is derived server-side from the authorized project ID. After the remote search, the route rechecks current project membership, attached collection IDs, allowed collection owners, ready item state, and local document-row identity before returning any hit. Responses are private/no-store and result text is bounded.

## Current limits

This is an optional read/search adapter, not full Agentset parity. Void-Agent does not yet mirror local file/text ingestion into Agentset, track or revoke remote ingest jobs, provide a namespace/profile management UI, or use Agentset hits inside chat/project-brain prompts. Existing local pgvector retrieval remains the working path. An Agentset key and populated namespace are required for live search verification; neither is available in this environment, so verification is limited to mocked HTTP and authorization tests.

The server uses the API key only. It does not forward caller cookies, arbitrary headers, source URLs, or browser-provided namespace identifiers to Agentset.
