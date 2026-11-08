// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() },
  data: {
    enabled: true,
    tier: "flare-pro",
    isFreeTier: false,
    activeSubscription: {
      id: "row-1",
      dodoSubscriptionId: "sub_1",
      dodoCustomerId: "cus_1" as string | null,
      status: "active",
      previousBillingDate: null,
      nextBillingDate: null,
      cancelAtNextBillingDate: false,
      cancelledAt: null,
    },
    availableTiers: [],
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("swr", () => ({
  default: () => ({ data: mocks.data, isLoading: false, mutate: vi.fn() }),
}));
vi.mock("@/components/payments/plan-card", () => ({
  PlanCard: () => null,
}));

import { DodoUpgradeCard } from "./dodo-upgrade-card";

describe("DodoUpgradeCard customer portal entry point", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              success: true,
              url: "https://customer.dodopayments.com/portal/session",
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      ),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("calls the authenticated server portal endpoint from the manage billing control", async () => {
    render(<DodoUpgradeCard />);
    fireEvent.click(screen.getByTestId("dodo-manage-billing-button"));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/payments/dodo/portal", {
        method: "POST",
      });
    });
  });

  it("does not show the portal control when no stored Dodo customer is available", () => {
    mocks.data.activeSubscription = {
      ...mocks.data.activeSubscription,
      dodoCustomerId: null,
    };
    render(<DodoUpgradeCard />);
    expect(screen.queryByTestId("dodo-manage-billing-button")).toBeNull();
  });
});
