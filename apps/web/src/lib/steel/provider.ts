import "server-only";

import type { BrowserProvider } from "lib/ai/tools/browser/browser-automation-tool";
import {
  IS_STEEL_CONFIGURED,
  createSteelBrowserSession,
  destroySteelBrowserSession,
  steelPlaywrightExecute,
} from "./client";

/**
 * The Steel provider object for the browser-automation tool.
 *
 * Returns `null` when STEEL_BASE_URL/STEEL_EXECUTOR_URL are not configured —
 * the chat route then falls through to the agent-browser CLI provider. No
 * browser-second billing (self-hosted, unmetered); the app-side credential
 * vault still applies, because placeholder substitution happens in the tool
 * layer, before code reaches the executor.
 */
export function createSteelBrowserProvider(): BrowserProvider | null {
  if (!IS_STEEL_CONFIGURED) return null;
  return {
    createSession: (options) =>
      createSteelBrowserSession({
        profile: options?.profile,
      }),
    destroySession: destroySteelBrowserSession,
    executeRaw: steelPlaywrightExecute,
    billBrowserSeconds: false,
  };
}
