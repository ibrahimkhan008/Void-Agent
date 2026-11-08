import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getPreferences: vi.fn(),
  redirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  }),
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/db/repository", () => ({
  userRepository: { getPreferences: mocks.getPreferences },
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import OnboardingPage from "./page";

describe("OnboardingPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires auth while preserving the onboarding return destination", async () => {
    mocks.getSession.mockResolvedValue(null);
    await expect(OnboardingPage()).rejects.toThrow(
      "REDIRECT:/sign-in?callbackUrl=%2Fonboarding",
    );
  });

  it("starts new users at the overview step", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
    mocks.getPreferences.mockResolvedValue({ savedNotes: [{ id: "n1" }] });
    const element = (await OnboardingPage()) as React.ReactElement<{
      children: React.ReactElement<{ initialStep: string }>;
    }>;
    expect(element.props.children.type).toBe(OnboardingWizard);
    expect(element.props.children.props.initialStep).toBe(
      "automation_overview",
    );
  });

  it("resumes the connected-app step and maps the legacy Rube step safely", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
    mocks.getPreferences
      .mockResolvedValueOnce({ onboarding: { step: "connect_tools" } })
      .mockResolvedValueOnce({ onboarding: { step: "connect_rube" } });
    for (const expected of ["connect_tools", "connect_tools"]) {
      const element = (await OnboardingPage()) as React.ReactElement<{
        children: React.ReactElement<{ initialStep: string }>;
      }>;
      expect(element.props.children.props.initialStep).toBe(expected);
    }
  });

  it("sends already-completed users through the verified cookie handler", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
    mocks.getPreferences.mockResolvedValue({ onboarding: { step: "done" } });
    await expect(OnboardingPage()).rejects.toThrow(
      "REDIRECT:/api/onboarding/complete",
    );
  });
});
