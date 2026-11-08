/** @vitest-environment jsdom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("ui/button", () => ({
  Button: ({ children, ...props }: React.ComponentProps<"button">) =>
    React.createElement("button", props, children),
}));

import { ScheduledJobsDashboard } from "./scheduled-jobs-dashboard";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ScheduledJobsDashboard", () => {
  it("reuses the schedule creation key when the same payload is retried", async () => {
    const randomUUID = vi.fn(() => "stable-create-key");
    vi.stubGlobal("crypto", { randomUUID });
    const createResponses = [
      Response.json({ error: "temporary failure" }, { status: 503 }),
      Response.json({ job: { id: "job-1" } }),
    ];
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith("/api/agent?filters=mine")) return Response.json([]);
        if (url === "/api/scheduler/jobs" && init?.method === "POST") {
          return createResponses.shift()!;
        }
        if (url === "/api/scheduler/jobs") {
          return Response.json({ jobs: [] });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<ScheduledJobsDashboard />);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/scheduler/jobs", {
        cache: "no-store",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Create schedule" }));
    fireEvent.change(screen.getByLabelText("What should Void-Agent do?"), {
      target: { value: "Send a daily summary" },
    });
    fireEvent.change(screen.getByLabelText(/Run at \(UTC\)/), {
      target: { value: "2030-04-05T09:30" },
    });

    const submit = () =>
      fireEvent.click(screen.getByRole("button", { name: "Create schedule" }));
    submit();
    await screen.findByRole("alert");
    submit();

    await waitFor(() => expect(createResponses).toHaveLength(0));
    const createRequests = fetchMock.mock.calls.filter(
      ([url, init]) =>
        url === "/api/scheduler/jobs" &&
        (init as RequestInit | undefined)?.method === "POST",
    );
    const firstCreate = createRequests[0]?.[1] as RequestInit;
    const retryCreate = createRequests[1]?.[1] as RequestInit;
    expect(new Headers(firstCreate.headers).get("Idempotency-Key")).toBe(
      "stable-create-key",
    );
    expect(new Headers(retryCreate.headers).get("Idempotency-Key")).toBe(
      "stable-create-key",
    );
    expect(firstCreate.body).toBe(retryCreate.body);
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it("creates an agent schedule using only an agent returned by the owned-agent list", async () => {
    const ownedAgent = {
      id: "agent-owned-by-me",
      name: "Research agent",
      instructions: { prompt: "Research carefully" },
    };
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/scheduler/jobs" && !init?.method) {
          return Response.json({ jobs: [] });
        }
        if (url.startsWith("/api/agent?filters=mine&limit=100")) {
          return Response.json([ownedAgent]);
        }
        if (url === "/api/scheduler/jobs" && init?.method === "POST") {
          return Response.json({ job: { id: "job-agent" } });
        }
        if (url === "/api/scheduler/jobs" && init?.method === "GET") {
          return Response.json({ jobs: [] });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", { randomUUID: () => "agent-schedule-key" });

    render(<ScheduledJobsDashboard />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Create schedule" }),
    );
    const agentSelector = await screen.findByLabelText(
      /Run as agent \(optional\)/,
    );
    await waitFor(() =>
      expect(agentSelector.hasAttribute("disabled")).toBe(false),
    );
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).startsWith("/api/agent?filters=mine&limit=100"),
      ),
    ).toBe(true);

    fireEvent.change(agentSelector, { target: { value: ownedAgent.id } });
    fireEvent.change(screen.getByLabelText("What should Void-Agent do?"), {
      target: { value: "Review my research notes" },
    });
    fireEvent.change(screen.getByLabelText(/Run at \(UTC\)/), {
      target: { value: "2030-04-05T09:30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create schedule" }));

    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          url === "/api/scheduler/jobs" && init?.method === "POST",
      );
      expect(createCall).toBeDefined();
      expect(JSON.parse(String(createCall?.[1]?.body))).toMatchObject({
        agentId: ownedAgent.id,
        prompt: "Review my research notes",
        scheduleType: "once",
      });
    });
  });

  it("shows safe failure diagnostics in recent run history", async () => {
    const jobs = [
      {
        id: "job-1",
        name: "Daily report",
        cron: "0 9 * * 1-5",
        status: "active",
        timezone: "UTC",
        nextRunAt: "2030-04-05T09:00:00.000Z",
        lastRunAt: null,
        payload: {
          scheduleType: "recurring",
          triggerMessage: "Create a report",
        },
      },
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ jobs }))
      .mockResolvedValueOnce(
        Response.json({
          runs: [
            {
              id: "run-1",
              startedAt: "2030-04-05T09:00:00.000Z",
              completedAt: "2030-04-05T09:00:01.000Z",
              status: "failed",
              failureDiagnostic: {
                code: "authentication",
                message: "The scheduler could not authenticate this run.",
              },
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<ScheduledJobsDashboard />);
    fireEvent.click(await screen.findByRole("button", { name: "Recent runs" }));
    expect(
      await screen.findByText("The scheduler could not authenticate this run."),
    ).toBeTruthy();
  });

  it("shows when the persisted next run disagrees with the cron schedule", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          jobs: [],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          now: "2026-11-08T08:30:00.000Z",
          environment: {
            cronSecret: true,
            internalSecret: true,
            baseUrl: true,
          },
          jobs: [
            {
              id: "job-1",
              name: "Daily report",
              status: "active",
              timezone: "UTC",
              persistedNextRunAt: "2026-11-08T08:32:00.000Z",
              computedNextRunAt: "2026-11-08T08:31:00.000Z",
              dueNow: false,
              scheduleDrift: true,
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<ScheduledJobsDashboard />);
    fireEvent.click(await screen.findByRole("button", { name: "Diagnostics" }));
    expect(
      await screen.findByText(/Schedule drift: stored .* cron predicts .*/),
    ).toBeTruthy();
  });
});
