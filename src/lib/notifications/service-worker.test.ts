import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const serviceWorkerSource = readFileSync("public/sw.js", "utf8");

function loadServiceWorker() {
  const listeners = new Map<string, (event: any) => void>();
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const openWindow = vi.fn().mockResolvedValue(undefined);
  const close = vi.fn();
  const clients = {
    claim: vi.fn(),
    matchAll: vi.fn().mockResolvedValue([]),
    openWindow,
  };
  const self = {
    addEventListener: (name: string, callback: (event: any) => void) =>
      listeners.set(name, callback),
    skipWaiting: vi.fn(),
    clients,
    location: { origin: "https://void.test" },
    registration: { showNotification },
  };
  runInNewContext(serviceWorkerSource, { self, URL, console });
  return { listeners, showNotification, openWindow, close, clients };
}

describe("service worker notification navigation", () => {
  it("falls back to the app for backslash, encoded-backslash, and control paths", async () => {
    const { listeners, showNotification } = loadServiceWorker();
    for (const href of [
      "/\\\\evil.example",
      "/%5c%5cevil.example",
      "/%255c%255cevil.example",
      "/line\nbreak",
    ]) {
      const waitUntil = vi.fn();
      listeners.get("push")?.({
        data: { json: () => ({ title: "Alert", href }) },
        waitUntil,
      });
      await waitUntil.mock.calls.at(-1)?.[0];
      expect(showNotification.mock.lastCall?.[1].data.href).toBe("/");
    }
  });

  it("keeps safe local paths and revalidates notification clicks", async () => {
    const { listeners, showNotification, openWindow, close } =
      loadServiceWorker();
    const pushWaitUntil = vi.fn();
    listeners.get("push")?.({
      data: { json: () => ({ title: "Done", href: "/chat/thread-1" }) },
      waitUntil: pushWaitUntil,
    });
    await pushWaitUntil.mock.calls[0][0];
    expect(showNotification.mock.lastCall?.[1].data.href).toBe(
      "/chat/thread-1",
    );

    const clickWaitUntil = vi.fn();
    listeners.get("notificationclick")?.({
      notification: { data: { href: "/\\\\evil.example" }, close },
      waitUntil: clickWaitUntil,
    });
    await clickWaitUntil.mock.calls[0][0];
    expect(close).toHaveBeenCalledOnce();
    expect(openWindow).toHaveBeenCalledWith("https://void.test/");
  });
});
