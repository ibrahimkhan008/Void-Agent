"use client";

import { DodoPaymentsSettings } from "@/components/admin/dodo-payments-settings";
import { CreditCard } from "lucide-react";

// Staging port note (WP6c): the destination payments page writes the whole
// site_config "payments" section through /api/admin/config. Staging instead
// ships a dedicated, secret-safe /api/admin/payments/dodo endpoint, so this
// page hosts the already-adapted DodoPaymentsSettings component against that
// API. Credentials are encrypted at rest and never returned to the client.
export default function PaymentsPage() {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-6 pt-6">
        <CreditCard className="size-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-semibold">Payments</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Dodo Payments credentials, environment, and tier → product id
            mapping used for self-service plan upgrades.
          </p>
        </div>
      </div>
      <DodoPaymentsSettings />
    </div>
  );
}
