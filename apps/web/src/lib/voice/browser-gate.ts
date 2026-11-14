import "server-only";
import { resolveBrowserAutomationGate } from "lib/ai/routing/service";
import { kernelEgressIsolated } from "lib/browser-egress/capability";
import {
  resolveBrowserToolSuppression,
  shouldReadBrowserPolicy,
} from "lib/chat/browser-tool-gate";
import { IS_KERNEL_CONFIGURED } from "lib/kernel/client";

export type VoiceBrowserActor = {
  userId: string;
  organizationId: string | null;
};

/**
 * Whether the voice session may drive a browser, and if not, why.
 *
 * Split out from `browser-run.ts` so the session route can ask the question
 * without pulling in the inner-agent tool factory, and so the answer is
 * testable without mocking one.
 *
 * Reuses the chat route's gate rather than restating it, so the two surfaces
 * cannot drift on what "browser automation is enabled" means. Two inputs are
 * pinned rather than passed:
 *
 * - `toolkitOn: true`. Voice has no tool picker — the drawer's tools dropdown
 *   renders a read-only list with no handlers — so there is no per-user toggle
 *   to consult, and the org AI policy is the only control. Passing `false`
 *   would disable the feature outright; omitting it would break the shared
 *   gate's ordering.
 * - `unattended: false`. A voice session is a person talking, by definition.
 *
 * Fails closed, because `resolveBrowserAutomationGate` does.
 */
export async function resolveVoiceBrowserSuppression(
  actor: VoiceBrowserActor,
): Promise<string | null> {
  const gateInput = {
    planModeActive: false,
    unattended: false,
    // Voice is Kernel-only on purpose: it surfaces Kernel's live view, which
    // the other providers do not have. B20: the session is also egress-gated —
    // a Kernel key without KERNEL_EGRESS_MODE=managed keeps voice browser runs
    // off, with the gate naming the fix.
    providerConfigured: IS_KERNEL_CONFIGURED,
    selectedProvider: kernelEgressIsolated() ? "kernel" : null,
    egressSkippedBy:
      IS_KERNEL_CONFIGURED && !kernelEgressIsolated() ? "kernel" : null,
    toolkitOn: true,
    taskBrowserEnabled: false,
  };
  const policyGate = shouldReadBrowserPolicy(gateInput)
    ? await resolveBrowserAutomationGate({
        organizationId: actor.organizationId,
        userId: actor.userId,
      })
    : null;
  return resolveBrowserToolSuppression({ ...gateInput, policyGate });
}
