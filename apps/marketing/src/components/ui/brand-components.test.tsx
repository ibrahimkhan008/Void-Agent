// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// framer-motion's useReducedMotion is exercised for real in jsdom; the
// IntersectionObserver is not available there — Reveal must still render
// its children (the pending state is CSS-gated, not JS-gated).
class FakeIntersectionObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}
vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);

const { BrandButton } = await import("./brand-button");
const { Eyebrow } = await import("./eyebrow");
const { AccentSpan } = await import("./accent-span");
const { Reveal } = await import("./reveal");
const { DitherCanvas } = await import("./dither-canvas");

describe("design-system extension components", () => {
  afterEach(cleanup);

  it("BrandButton renders variants and sizes with the button slot", () => {
    render(
      <BrandButton variant="outline" size="lg">
        Outline
      </BrandButton>,
    );
    const btn = screen.getByRole("button", { name: "Outline" });
    expect(btn).toBeTruthy();
    expect(btn.getAttribute("data-slot")).toBe("brand-button");
    expect(btn.className).toContain("bs-btn-outline");
    expect(btn.className).toContain("h-10");
  });

  it("Eyebrow renders the label with the glow asterisk", () => {
    render(<Eyebrow>Monospace micro-label</Eyebrow>);
    expect(screen.getByText("Monospace micro-label")).toBeTruthy();
    expect(document.querySelector("svg")).toBeTruthy();
  });

  it("AccentSpan applies the landing-accent class", () => {
    render(<AccentSpan>one token at a time.</AccentSpan>);
    const span = screen.getByText("one token at a time.");
    expect(span.className).toContain("bs-accent");
  });

  it("Reveal renders children in the pending state (no-JS safe)", () => {
    render(
      <Reveal delay={0.1} blur={8}>
        Reveal block content
      </Reveal>,
    );
    const el = screen.getByText("Reveal block content");
    expect(el.getAttribute("data-reveal")).toBe("pending");
    expect(el.style.getPropertyValue("--rise")).toBe("14px");
  });

  it("DitherCanvas renders the pixelated raster and its canvas overlay", () => {
    render(
      <DitherCanvas
        src="data:image/gif;base64,R0lGODlhAQABAAAAACw="
        width={120}
        height={80}
      />,
    );
    const img = document.querySelector("img");
    const canvas = document.querySelector("canvas");
    expect(img).toBeTruthy();
    expect(canvas?.getAttribute("width")).toBe("120");
  });
});
