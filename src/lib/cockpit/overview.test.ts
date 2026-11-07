import { describe, expect, it } from "vitest";
import {
  buildCockpitOperationalAlerts,
  classifyCockpitConnection,
  parseCockpitConnectionStatus,
} from "./overview";

describe("classifyCockpitConnection", () => {
  it("distinguishes verified, failed, untested, disconnected and unavailable states", () => {
    expect(
      classifyCockpitConnection({
        connected: true,
        lastTestedAt: "2026-11-07T00:00:00.000Z",
        lastTestOk: true,
        canManage: true,
      }),
    ).toBe("ready");
    expect(
      classifyCockpitConnection({
        connected: true,
        lastTestedAt: "2026-11-07T00:00:00.000Z",
        lastTestOk: false,
        canManage: false,
      }),
    ).toBe("needs-attention");
    expect(
      classifyCockpitConnection({
        connected: true,
        lastTestedAt: null,
        lastTestOk: null,
        canManage: true,
      }),
    ).toBe("connected-untested");
    expect(
      classifyCockpitConnection({
        connected: false,
        lastTestedAt: null,
        lastTestOk: null,
        canManage: true,
      }),
    ).toBe("not-connected");
    expect(classifyCockpitConnection(null)).toBe("unavailable");
  });

  it("rejects incomplete or unexpected provider status payloads", () => {
    expect(parseCockpitConnectionStatus(null)).toBeNull();
    expect(parseCockpitConnectionStatus({ connected: "yes" })).toBeNull();
    expect(
      parseCockpitConnectionStatus({
        connected: true,
        lastTestedAt: null,
        lastTestOk: null,
        canManage: true,
      }),
    ).toEqual({
      connected: true,
      lastTestedAt: null,
      lastTestOk: null,
      canManage: true,
    });
  });
});

describe("buildCockpitOperationalAlerts", () => {
  it("projects failed production deployments and active Superlog incidents", () => {
    expect(
      buildCockpitOperationalAlerts(
        {
          projects: [
            {
              label: "Web",
              deploy: {
                id: "deployment-1",
                state: "ERROR",
                createdAt: "2026-11-06T10:00:00.000Z",
              },
            },
            {
              label: "Healthy",
              deploy: { id: "deployment-2", state: "READY" },
            },
          ],
        },
        {
          incidents: [
            {
              id: "incident-1",
              title: "API unavailable",
              service: "api",
              severity: "SEV-1",
              startedAt: "2026-11-06T11:00:00.000Z",
            },
            { title: "Malformed without an id" },
          ],
        },
      ),
    ).toEqual([
      {
        id: "vercel:deployment-1",
        provider: "vercel",
        title: "Deployment failed: Web",
        detail: "The latest production deployment for Web ended in ERROR.",
        occurredAt: "2026-11-06T10:00:00.000Z",
      },
      {
        id: "superlog:incident-1",
        provider: "superlog",
        title: "Open incident: API unavailable",
        detail: "Service: api · Severity: SEV-1",
        occurredAt: "2026-11-06T11:00:00.000Z",
      },
    ]);
  });

  it("bounds and safely ignores malformed provider payloads", () => {
    expect(
      buildCockpitOperationalAlerts(null, { incidents: [{ title: "No id" }] }),
    ).toEqual([]);
    expect(
      buildCockpitOperationalAlerts(
        {
          projects: Array.from({ length: 40 }, (_, index) => ({
            label: `project-${index}`,
            deploy: { id: `deploy-${index}`, state: "ERROR" },
          })),
        },
        null,
      ),
    ).toHaveLength(20);
  });
});
