// Steel executor: runs agent-written Playwright code against a Steel session's
// CDP endpoint, in THIS container — never inside the app server.
//
// Kernel's cloud runtime executes the model's Playwright code remotely; the
// self-hosted Steel provider keeps that property with this sidecar. The app
// posts { cdpUrl, code, timeoutSec }; the executor connects Playwright over
// CDP to the session's browser, evaluates the code with `page`, `context`,
// `browser` and `playwright` in scope, and returns the code's return value
// (a string) or a serialized value, the same shape the Kernel path hands to
// the tool's redaction layer.
//
// The executor is a member of the internal Docker network only: it accepts
// arbitrary code and must never be exposed beyond it.

const http = require("node:http");
const { chromium } = require("playwright-core");

const PORT = Number(process.env.PORT || 8080);
const MAX_RESULT_CHARS = 16_000;
const MAX_CODE_CHARS = 64_000;

function serialize(value) {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  const seen = new WeakSet();
  try {
    const json = JSON.stringify(
      value,
      (_key, entry) => {
        if (typeof entry === "object" && entry !== null) {
          if (seen.has(entry)) return "[Circular]";
          seen.add(entry);
        }
        return entry;
      },
      2,
    );
    return json === undefined ? String(value) : json;
  } catch {
    return String(value);
  }
}

/**
 * Evaluate the agent's code the same way Kernel's runtime does: an async
 * function body with the Playwright primitives in scope, whose return value
 * becomes the tool result.
 */
async function runCode(cdpUrl, code, timeoutSec, signal) {
  const browser = await chromium.connectOverCDP(cdpUrl, {
    timeout: 20_000,
  });
  try {
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page =
      context.pages()[0] ?? (await context.newPage());

    const body = `return (async () => {\n${code}\n})();`;
    // `Function` compiles the code inside THIS container's VM, with no Node
    // globals exposed beyond what the Playwright objects carry. Arbitrary
    // code executes here by design — this container exists to be the
    // isolation boundary, which is why it stays off any public network.
    const fn = new Function("page", "context", "browser", "playwright", body);
    const value = await fn(page, context, browser, require("playwright-core"));
    return serialize(value);
  } finally {
    // Disconnects the CDP session; the Steel-managed browser stays alive.
    await browser.close().catch(() => {});
  }
}

function readBody(request, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("Body too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

const server = http.createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/healthz") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  if (request.method === "POST" && request.url === "/execute") {
    let payload;
    try {
      payload = JSON.parse(await readBody(request, 2 * 1024 * 1024));
    } catch (error) {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: false, error: error.message }));
      return;
    }

    const { cdpUrl, code, timeoutSec } = payload ?? {};
    if (!cdpUrl || typeof code !== "string" || !code.trim()) {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({ ok: false, error: "cdpUrl and code are required" }),
      );
      return;
    }
    if (code.length > MAX_CODE_CHARS) {
      response.writeHead(413, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: false, error: "Code too large" }));
      return;
    }

    const started = Date.now();
    try {
      const result = await runCode(
        cdpUrl,
        code,
        timeoutSec,
        request,
      );
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          ok: true,
          result,
          durationMs: Date.now() - started,
        }),
      );
    } catch (error) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          ok: false,
          error: String(error?.message ?? error).slice(0, 2_000),
          durationMs: Date.now() - started,
        }),
      );
    }
    return;
  }

  response.writeHead(404, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ error: "Not Found" }));
});

server.listen(PORT, () => {
  console.log(`steel-executor listening on :${PORT}`);
});
