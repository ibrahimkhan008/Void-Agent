import { describe, expect, it } from "vitest";
import { repairBoundToolName } from "./repair-bound-tool-name";

describe("repairBoundToolName", () => {
  const bound = ["COMPOSIO_SEARCH_TOOLS", "webSearch", "requestInput"];

  it.each([
    ["functions_COMPOSIO_SEARCH_TOOLS", "COMPOSIO_SEARCH_TOOLS"],
    ["functions.COMPOSIO_SEARCH_TOOLS", "COMPOSIO_SEARCH_TOOLS"],
    ["tools:COMPOSIO_SEARCH_TOOLS", "COMPOSIO_SEARCH_TOOLS"],
    ["webSearch:12", "webSearch"],
    ["TOOLS.REQUESTINPUT", "requestInput"],
  ])("repairs %s to the unique bound tool", (rawName, expected) => {
    expect(repairBoundToolName(bound, rawName)).toBe(expected);
  });

  it("does not invent a tool or match a partial name", () => {
    expect(
      repairBoundToolName(bound, "functions_delete_everything"),
    ).toBeNull();
    expect(repairBoundToolName(bound, "COMPOSIO_SEARCH")).toBeNull();
    expect(repairBoundToolName([], "webSearch")).toBeNull();
  });

  it("rejects ambiguous case-insensitive matches", () => {
    expect(repairBoundToolName(["Search", "search"], "SEARCH")).toBeNull();
  });

  it("preserves exact names even when another tool differs only by case", () => {
    expect(repairBoundToolName(["Search", "search"], "search")).toBe("search");
  });

  it("does not strip arbitrary namespaces or malformed suffixes", () => {
    expect(repairBoundToolName(bound, "namespace.evil.webSearch")).toBeNull();
    expect(repairBoundToolName(bound, "webSearch:abc")).toBeNull();
  });
});
