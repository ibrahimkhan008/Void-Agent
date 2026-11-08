// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RequestInputCard } from "./request-input-card";

vi.mock("ui/button", () => ({
  Button: ({
    children,
    size: _size,
    variant: _variant,
    ...props
  }: React.ComponentProps<"button"> & { size?: string; variant?: string }) =>
    React.createElement("button", props, children),
}));
vi.mock("ui/input", () => ({
  Input: (props: React.ComponentProps<"input">) =>
    React.createElement("input", props),
}));

afterEach(cleanup);

describe("RequestInputCard", () => {
  it("supports descriptive multi-select choices and submits all selected values", () => {
    const onSubmit = vi.fn();
    render(
      <RequestInputCard
        questions={[
          {
            header: "Sources",
            question: "Which sources should I include?",
            options: [
              { label: "Contracts", description: "Signed agreements" },
              { label: "Invoices", description: "Billing records" },
            ],
            multiSelect: true,
            placeholder: "Add another source",
          },
        ]}
        submitted={null}
        disabled={false}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByText("Signed agreements")).not.toBeNull();
    const contracts = screen.getByRole("button", { name: /Contracts/ });
    const invoices = screen.getByRole("button", { name: /Invoices/ });
    fireEvent.click(contracts);
    fireEvent.click(invoices);
    expect(contracts.getAttribute("aria-pressed")).toBe("true");
    expect(invoices.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Send answers" }));
    expect(onSubmit).toHaveBeenCalledWith([
      {
        header: "Sources",
        question: "Which sources should I include?",
        value: "Contracts, Invoices",
      },
    ]);
  });

  it("supports typed free-text answers and keeps legacy string choices", () => {
    const onSubmit = vi.fn();
    render(
      <RequestInputCard
        questions={[
          {
            header: "Budget",
            question: "What is the budget?",
            inputType: "number",
            placeholder: "Amount in USD",
          },
          {
            header: "Format",
            question: "Which format?",
            options: ["PDF", "CSV"],
          },
        ]}
        submitted={null}
        disabled={false}
        onSubmit={onSubmit}
      />,
    );

    const budget = screen.getByLabelText("What is the budget?");
    expect(budget.getAttribute("type")).toBe("number");
    expect(budget.getAttribute("placeholder")).toBe("Amount in USD");
    fireEvent.change(budget, { target: { value: "250" } });
    fireEvent.click(screen.getByRole("button", { name: "PDF" }));
    fireEvent.click(screen.getByRole("button", { name: "Send answers" }));

    expect(onSubmit).toHaveBeenCalledWith([
      {
        header: "Budget",
        question: "What is the budget?",
        value: "250",
      },
      { header: "Format", question: "Which format?", value: "PDF" },
    ]);
  });

  it("allows typing to replace selected choices", () => {
    const onSubmit = vi.fn();
    render(
      <RequestInputCard
        questions={[
          {
            header: "Cadence",
            question: "How often?",
            options: ["Weekly", "Monthly"],
          },
        ]}
        submitted={null}
        disabled={false}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Weekly" }));
    fireEvent.change(screen.getByLabelText("How often?"), {
      target: { value: "Every other week" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send answers" }));
    expect(onSubmit).toHaveBeenCalledWith([
      {
        header: "Cadence",
        question: "How often?",
        value: "Every other week",
      },
    ]);
  });
});
