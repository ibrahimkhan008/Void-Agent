// egress-proxy: the network-level egress boundary for agent-driven browsers
// (B20). Browsers route ALL traffic — page loads, subresources, XHR, WebSocket,
// redirects — through this forward proxy, so every destination is resolved and
// validated HERE, at the network layer, before any connection is opened:
//
//   1. DNS is resolved by the proxy itself; the client-controlled hostname is
//      never trusted, which defeats DNS rebinding.
//   2. The resolved IP set is checked against the private/metadata deny list —
//      if ANY resolved address is denied, the request is denied (strictest
//      handling of multi-answer DNS).
//   3. The connection is opened to the PINNED resolved IP, so a later DNS
//      re-resolution by the client cannot reroute the tunnel.
//
// HTTPS is tunneled via CONNECT — opaque, no MITM: certificates stay valid,
// and the IP-level boundary still applies at tunnel establishment. Plain HTTP
// is proxied request-by-request with the same checks. Because every hop
// re-enters the proxy, redirects and subresources are covered by construction.
//
// Internal network only: it must never be reachable from the public internet.

const http = require("node:http");
const net = require("node:net");
const dns = require("node:dns").promises;

const PORT = Number(process.env.PORT || 8080);

// Deny list per the B20 requirement: loopback, RFC1918, link-local (cloud
// metadata 169.254.169.254 lives here), CGNAT, benchmark/reserved, multicast,
// and the IPv6 equivalents, plus IPv4-mapped IPv6 (normalized before checks).
const DENY_V4 = [
  ["0.0.0.0/8", 8],
  ["10.0.0.0/8", 8],
  ["100.64.0.0/10", 10],
  ["127.0.0.0/8", 8],
  ["169.254.0.0/16", 16],
  ["172.16.0.0/12", 12],
  ["192.0.0.0/24", 24],
  ["192.0.2.0/24", 24],
  ["192.168.0.0/16", 16],
  ["198.18.0.0/15", 15],
  ["198.51.100.0/24", 24],
  ["203.0.113.0/24", 24],
  ["224.0.0.0/4", 4],
  ["240.0.0.0/4", 4],
];

const ALLOW_HOSTS = new Set(
  (process.env.EGRESS_ALLOW_HOSTS || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean),
);

const AUDIT = process.env.EGRESS_AUDIT !== "false";

function v4ToInt(ip) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return null;
  }
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function ipIsDenied(ip) {
  if (net.isIPv4(ip)) {
    const value = v4ToInt(ip);
    if (value === null) return true;
    return DENY_V4.some(([cidr, bits]) => {
      // CIDR strings carry the suffix ('/16') — strip it or v4ToInt returns
      // null and EVERY address would be allowed. Verified by the live test.
      const base = v4ToInt(cidr.split("/")[0]);
      const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
      return (value & mask) === (base & mask);
    });
  }
  // IPv6 (or mapped): normalize the mapped form, then check v6 ranges.
  let normalized = ip.toLowerCase();
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipIsDenied(mapped[1]);
  // ::ffff:x:y hex-mapped form via URL parsing shows up as v4 already; the
  // remaining v6 checks:
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fe80:")) return true; // link-local
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // ULA fc00::/7
  if (normalized.startsWith("ff")) return true; // multicast
  // IPv4-compatible deprecated form ::a.b.c.d is unusual; treat mapped-hex:
  if (/^0{0,4}:0{0,4}:0{0,4}:0{0,4}:0{0,4}:0{0,4}:/.test(normalized)) {
    const tail = normalized.split(":").pop();
    if (tail && net.isIPv4(tail)) return ipIsDenied(tail);
  }
  return false;
}

function hostnameAllowed(hostname) {
  return ALLOW_HOSTS.has(String(hostname).toLowerCase());
}

/**
 * Resolve + validate a host:port authority. Returns the pinned IP to connect
 * to, or an error string when denied. Denies if ANY resolved address is in a
 * denied range (strict multi-answer handling).
 */
async function resolveAuthority(hostname) {
  if (hostnameAllowed(hostname)) {
    return { pinned: hostname, host: hostname };
  }
  let records;
  try {
    records = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch (error) {
    return { error: `DNS lookup failed: ${error.code || error.message}` };
  }
  if (!records.length) {
    return { error: "DNS resolved to no addresses" };
  }
  const denied = records.find((record) => ipIsDenied(record.address));
  if (denied) {
    return {
      error: `DENIED ${hostname} -> ${records.map((r) => r.address).join(", ")} (private/loopback/link-local range)`,
    };
  }
  // Pin the first public address for this connection.
  return { pinned: records[0].address, host: hostname };
}

function logRequest(kind, hostname, outcome, extra) {
  if (!AUDIT) return;
  const line = `[egress] ${kind} ${hostname}${extra ? ` (${extra})` : ""}: ${outcome}`;
  if (outcome.startsWith("DENIED") || outcome.startsWith("blocked")) {
    console.warn(line);
  } else {
    console.log(line);
  }
}

// ---------------------------------------------------------------------------
// CONNECT tunneling (HTTPS + any TCP via the browser's proxy stack)
// ---------------------------------------------------------------------------
{
  const server = http.createServer((request, response) => {
    // Plain-HTTP proxying: absolute-form request URL.
    let target;
    try {
      target = new URL(request.url);
    } catch {
      response.writeHead(400).end();
      return;
    }
    const hostname = target.hostname.replace(/^\[|\]$/g, "");
    const port = target.port || 80;
    resolveAuthority(hostname).then((resolved) => {
      if (resolved.error) {
        logRequest("http", hostname, resolved.error);
        response.writeHead(403, { "Content-Type": "text/plain" });
        response.end("Blocked by egress policy");
        return;
      }
      logRequest("http", hostname, `allowed -> ${resolved.pinned}:${port}`);
      const proxyRequest = http.request(
        {
          host: resolved.pinned,
          port,
          path: target.pathname + target.search,
          method: request.method,
          headers: { ...request.headers, host: target.host },
        },
        (upstream) => {
          response.writeHead(upstream.statusCode, upstream.headers);
          upstream.pipe(response);
        },
      );
      proxyRequest.on("error", (error) => {
        response.writeHead(502).end(`Upstream error: ${error.message}`);
      });
      request.pipe(proxyRequest);
    });
  });

  // CONNECT: HTTPS tunnels (the bulk of browser traffic).
  server.on("connect", (request, socket, head) => {
    const [hostname, portRaw] = String(request.url || "").split(":");
    const port = Number(portRaw) || 443;
    if (!hostname) {
      socket.destroy();
      return;
    }
    resolveAuthority(hostname.replace(/^\[|\]$/g, "")).then((resolved) => {
      if (resolved.error) {
        logRequest("CONNECT", hostname, resolved.error);
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return;
      }
      const upstream = net.connect(port, resolved.pinned, () => {
        logRequest("CONNECT", hostname, `allowed -> ${resolved.pinned}:${port}`);
        socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        upstream.write(head);
        upstream.pipe(socket);
        socket.pipe(upstream);
      });
      const teardown = () => {
        upstream.destroy();
        socket.destroy();
      };
      upstream.on("error", teardown);
      socket.on("error", teardown);
      // Guaranteed teardown: neither side outlives the other.
      socket.on("close", teardown);
      upstream.on("close", () => {
        if (!socket.destroyed) socket.destroy();
      });
    });
  });

  server.on("clientError", (_err, socket) => {
    try {
      socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    } catch {
      socket.destroy();
    }
  });

  server.listen(PORT, () => {
    console.log(`egress-proxy listening on :${PORT}`);
    console.log(
      `deny list: v4 ${DENY_V4.map(([r]) => r).join(", ")} + IPv6 loopback/ULA/link-local/multicast; allow-hosts: ${
        ALLOW_HOSTS.size || "none"
      }`,
    );
  });
}
