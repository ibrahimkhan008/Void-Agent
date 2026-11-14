import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  EGRESS_FIX_HINTS,
  agentBrowserEgressIsolated,
  agentBrowserEgressProxyUrl,
  isBrowserEgressIsolationEnabled,
  kernelEgressIsolated,
  kernelProxyMode,
  selectIsolatedBrowserProvider,
  steelEgressIsolated,
  steelEgressProxyUrl,
} from "./capability";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("per-provider egress isolation capability (B20)", () => {
  it("keeps the operator master flag fail-closed", () => {
    vi.stubEnv("BROWSER_EGRESS_ISOLATION_ENABLED", "true");
    expect(isBrowserEgressIsolationEnabled()).toBe(true);
    vi.stubEnv("BROWSER_EGRESS_ISOLATION_ENABLED", "1");
    expect(isBrowserEgressIsolationEnabled()).toBe(false);
    vi.stubEnv("BROWSER_EGRESS_ISOLATION_ENABLED", "");
    expect(isBrowserEgressIsolationEnabled()).toBe(false);
  });

  it("isolates Kernel only in managed-proxy mode", () => {
    vi.stubEnv("KERNEL_EGRESS_MODE", "managed");
    expect(kernelEgressIsolated()).toBe(true);
    expect(kernelProxyMode()).toBe("managed");
    vi.stubEnv("KERNEL_EGRESS_MODE", "direct");
    expect(kernelEgressIsolated()).toBe(false);
    expect(kernelProxyMode()).toBe("direct");
    vi.stubEnv("KERNEL_EGRESS_MODE", "MANAGED");
    expect(kernelEgressIsolated()).toBe(true);
    vi.stubEnv("KERNEL_EGRESS_MODE", "");
    expect(kernelEgressIsolated()).toBe(false);
  });

  it("isolates Steel only with the egress proxy URL", () => {
    vi.stubEnv("STEEL_EGRESS_PROXY_URL", "");
    expect(steelEgressIsolated()).toBe(false);
    expect(steelEgressProxyUrl()).toBeNull();
    vi.stubEnv("STEEL_EGRESS_PROXY_URL", "http://egress:8080");
    expect(steelEgressIsolated()).toBe(true);
    expect(steelEgressProxyUrl()).toBe("http://egress:8080");
    vi.stubEnv("STEEL_EGRESS_PROXY_URL", "   ");
    expect(steelEgressIsolated()).toBe(false);
  });

  it("isolates agent-browser only with the egress proxy URL", () => {
    vi.stubEnv("AGENT_BROWSER_EGRESS_PROXY_URL", "");
    expect(agentBrowserEgressIsolated()).toBe(false);
    expect(agentBrowserEgressProxyUrl()).toBeNull();
    vi.stubEnv("AGENT_BROWSER_EGRESS_PROXY_URL", "http://egress:8080");
    expect(agentBrowserEgressIsolated()).toBe(true);
    expect(agentBrowserEgressProxyUrl()).toBe("http://egress:8080");
  });

  it("every provider has a fix hint naming its env", () => {
    expect(EGRESS_FIX_HINTS.kernel).toContain("KERNEL_EGRESS_MODE");
    expect(EGRESS_FIX_HINTS.steel).toContain("STEEL_EGRESS_PROXY_URL");
    expect(EGRESS_FIX_HINTS["agent-browser"]).toContain(
      "AGENT_BROWSER_EGRESS_PROXY_URL",
    );
  });
});

describe("selectIsolatedBrowserProvider", () => {
  const all = {
    kernelConfigured: true,
    steelConfigured: true,
    agentBrowserConfigured: true,
  };

  it("prefers Kernel when it is configured and isolated", () => {
    vi.stubEnv("KERNEL_EGRESS_MODE", "managed");
    vi.stubEnv("STEEL_EGRESS_PROXY_URL", "http://egress:8080");
    expect(selectIsolatedBrowserProvider(all)).toEqual({
      provider: "kernel",
      skippedBy: null,
    });
  });

  it("skips an unisolated Kernel and binds an isolated Steel", () => {
    vi.stubEnv("KERNEL_EGRESS_MODE", "direct");
    vi.stubEnv("STEEL_EGRESS_PROXY_URL", "http://egress:8080");
    expect(selectIsolatedBrowserProvider(all)).toEqual({
      provider: "steel",
      skippedBy: "kernel",
    });
  });

  it("skips all unisolated providers and records the first skip", () => {
    vi.stubEnv("KERNEL_EGRESS_MODE", "direct");
    vi.stubEnv("STEEL_EGRESS_PROXY_URL", "");
    vi.stubEnv("AGENT_BROWSER_EGRESS_PROXY_URL", "");
    expect(selectIsolatedBrowserProvider(all)).toEqual({
      provider: null,
      skippedBy: "kernel",
    });
  });

  it("binds the CLI when it is the only isolated provider", () => {
    vi.stubEnv("KERNEL_EGRESS_MODE", "direct");
    vi.stubEnv("STEEL_EGRESS_PROXY_URL", "");
    vi.stubEnv("AGENT_BROWSER_EGRESS_PROXY_URL", "http://egress:8080");
    expect(selectIsolatedBrowserProvider(all)).toEqual({
      provider: "agent-browser",
      skippedBy: "kernel",
    });
  });

  it("returns null when nothing is configured at all", () => {
    expect(
      selectIsolatedBrowserProvider({
        kernelConfigured: false,
        steelConfigured: false,
        agentBrowserConfigured: false,
      }),
    ).toEqual({ provider: null, skippedBy: null });
  });
});
