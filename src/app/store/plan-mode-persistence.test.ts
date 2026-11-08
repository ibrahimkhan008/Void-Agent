/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";

describe("plan mode preference persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("persists the selected mode so it survives store rehydration", async () => {
    const { appStore } = await import("./index");
    appStore.setState({ planMode: false });
    await appStore.persist.rehydrate();

    appStore.setState({ planMode: true });
    const raw = localStorage.getItem("mc-app-store-v2.0.1");
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw ?? "{}").state.planMode).toBe(true);

    appStore.setState({ planMode: false });
    localStorage.setItem("mc-app-store-v2.0.1", raw ?? "{}");
    await appStore.persist.rehydrate();
    expect(appStore.getState().planMode).toBe(true);
  });
});
