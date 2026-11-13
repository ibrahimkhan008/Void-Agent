# Voice agent delegation

Voice sessions can call `runAgent` to ask an accessible Void Agent agent a question and speak its answer in the current session. Delegation runs a single text turn with the selected agent's configured model and instructions. It has no tool access and cannot take external actions.

The route enforces authentication, same-origin requests, per-user rate limits, agent access checks, bounded input/output, an execution timeout, and the active team's monthly AI budget. Provider errors are returned as a generic message. Model choice comes from the agent's enabled pinned model, then the enabled provider default; the client cannot select a model.

## Provider availability

- **OpenAI Realtime:** `runAgent` is included in the server-created Realtime session tools.
- **Groq/Konvo:** `runAgent` is included in the server-created function tool list.
- **ElevenLabs/Kimi:** the browser callback is implemented, but ElevenLabs client tools are configured on the ElevenLabs conversational agent in its dashboard. The SDK cannot add a client tool dynamically when starting the session.

## ElevenLabs dashboard setup

In the conversational agent identified by `ELEVENLABS_AGENT_ID`, add a **client tool** with the exact name `runAgent` and this argument schema:

```json
{
  "type": "object",
  "properties": {
    "agent": { "type": "string", "description": "The exact name of the agent to ask." },
    "question": { "type": "string", "description": "The complete question, including relevant context." }
  },
  "required": ["agent", "question"],
  "additionalProperties": false
}
```

Configure this tool as **blocking** so the voice model waits for the client result before replying. The client calls the authenticated same-origin `/api/voice/run-agent` route and returns the delegated agent name and answer. Do not put API keys in this tool configuration.

The ElevenLabs path requires no new server credential, but its live behavior is not verified until this matching dashboard tool exists and a signed-in voice session invokes it.

## Verification

Focused tests:

```sh
pnpm test -- src/app/api/voice/run-agent/route.test.ts src/lib/ai/speech/run-agent.test.ts src/lib/ai/speech/voice-tools.test.ts
```
