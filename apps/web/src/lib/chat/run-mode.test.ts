import { AppDefaultToolkit } from "lib/ai/tools";
import { describe, expect, it } from "vitest";
import {
  CLOUD_AGENT_EXECUTION_MODE,
  isUnattended,
  resolveUnattendedToolkits,
} from "./run-mode";

describe("isUnattended", () => {
  it("separates the two run modes", () => {
    expect(isUnattended("unattended")).toBe(true);
    expect(isUnattended("interactive")).toBe(false);
  });
});

describe("resolveUnattendedToolkits", () => {
  it("passes the list through untouched for non-cloud-agent modes", () => {
    expect(
      resolveUnattendedToolkits({
        executionMode: "agent",
        allowedAppDefaultToolkit: ["webSearch"],
      }),
    ).toEqual(["webSearch"]);
    expect(
      resolveUnattendedToolkits({
        executionMode: "chat",
        allowedAppDefaultToolkit: ["webSearch", "memory"],
      }),
    ).toEqual(["webSearch", "memory"]);
  });

  it("passes an undefined list through for interactive runs", () => {
    expect(
      resolveUnattendedToolkits({
        executionMode: null,
        allowedAppDefaultToolkit: undefined,
      }),
    ).toBeUndefined();
  });

  it("unions the E2B code toolkit into a cloud-agent run", () => {
    expect(
      resolveUnattendedToolkits({
        executionMode: CLOUD_AGENT_EXECUTION_MODE,
        allowedAppDefaultToolkit: ["webSearch", "memory"],
      }),
    ).toEqual(["webSearch", "memory", AppDefaultToolkit.Code]);
  });

  it("adds the code toolkit even when the body carried none", () => {
    expect(
      resolveUnattendedToolkits({
        executionMode: "cloud-agent",
        allowedAppDefaultToolkit: undefined,
      }),
    ).toEqual([AppDefaultToolkit.Code]);
  });

  it("does not duplicate the code toolkit when it was already present", () => {
    expect(
      resolveUnattendedToolkits({
        executionMode: "cloud-agent",
        allowedAppDefaultToolkit: ["webSearch", "memory", "code"],
      }),
    ).toEqual(["webSearch", "memory", "code"]);
  });

  it("fails closed: a missing execution mode grants no sandbox enforcement", () => {
    // A failed context read surfaces as null — the run must not be treated as
    // cloud-agent (and the browser grants are denied the same way).
    expect(
      resolveUnattendedToolkits({
        executionMode: null,
        allowedAppDefaultToolkit: ["webSearch"],
      }),
    ).toEqual(["webSearch"]);
  });
});
