/**
 * Client-side edition seam.
 *
 * Surfaces that only exist in the hosted product — billing, the managed
 * builders — are reached through this module so that consumers never branch
 * on the edition themselves. Creating a team organization runs on the Better
 * Auth organization plugin in every edition and is reached through the same
 * seam. `./impl`, `./providers` and `./popups` are the edition-specific
 * files; this list of exports is the contract both editions satisfy.
 *
 * Client-safe exports only. `CloudProviders` reaches a server-only module, so
 * it is imported from `./providers` directly by the server components that
 * use it — re-exporting it here would drag that module into every client
 * bundle that touches the gate.
 */
export { GatePopups } from "./popups";
export {
  BillingMenuItem,
  ReferralEnabledProvider,
  WorkspaceMenuSection,
  useLocalModelsCheckout,
  useReferralEnabled,
} from "./impl";
