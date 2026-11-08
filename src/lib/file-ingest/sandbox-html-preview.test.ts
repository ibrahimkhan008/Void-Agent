import { describe, expect, it } from "vitest";
import {
  SANDBOX_HTML_PREVIEW_CSP,
  sanitizeSandboxHtmlPreview,
  wrapSandboxHtmlPreview,
} from "./sandbox-html-preview";

describe("sandbox HTML preview sanitizer", () => {
  it("removes script, event, navigation, form, frame, and external resource vectors", () => {
    const hostile = `
      <html><head>
        <meta http-equiv="refresh" content="0;url=https://evil.example">
        <link rel="stylesheet" href="https://evil.example/steal.css">
        <script>parent.location='https://evil.example'; fetch('https://evil.example')</script>
        <style>@import url(https://evil.example/steal.css); body{background:url(https://evil.example/pixel)}</style>
      </head><body onload="fetch('https://evil.example')">
        <a href="https://evil.example" target="_top" ping="https://evil.example">leave</a>
        <a href="javascript:parent.location='https://evil.example'">script link</a>
        <img src="https://evil.example/pixel" onerror="parent.location='https://evil.example'">
        <iframe src="https://evil.example"></iframe>
        <form action="https://evil.example"><button>submit</button></form>
        <svg onload="parent.location='https://evil.example'"><script>evil()</script></svg>
        <div style="background-image:url(https://evil.example/pixel)">safe content</div>
      </body></html>`;

    const output = sanitizeSandboxHtmlPreview(hostile);
    expect(output).toContain("safe content");
    expect(output).toContain("@import url(https://evil.example/steal.css)");
    expect(output).not.toMatch(
      /<script|<iframe|<form|<button|<svg|<meta|<link/i,
    );
    expect(output).not.toMatch(
      /onload|onerror|href=|target=|ping=|src="https:/i,
    );
  });

  it("keeps only bounded raster data images and strips active SVG and remote images", () => {
    const output = sanitizeSandboxHtmlPreview(
      '<img alt="remote" src="https://evil.example/pixel"><img alt="safe" src="data:image/png;base64,aGVsbG8="><img alt="svg" src="data:image/svg+xml;base64,PHN2Zz4=">',
    );
    expect(output).toContain('alt="safe"');
    expect(output).toContain("data:image/png;base64,aGVsbG8=");
    expect(output).not.toContain("evil.example");
    expect(output).not.toContain("image/svg+xml");
  });

  it("wraps the preview with a network-denying, origin-sandboxing CSP", () => {
    const output = wrapSandboxHtmlPreview("<p>preview</p>");
    expect(output).toContain("<p>preview</p>");
    expect(SANDBOX_HTML_PREVIEW_CSP).toContain("sandbox;");
    expect(SANDBOX_HTML_PREVIEW_CSP).toContain("default-src 'none'");
    expect(SANDBOX_HTML_PREVIEW_CSP).toContain("script-src 'none'");
    expect(SANDBOX_HTML_PREVIEW_CSP).toContain("connect-src 'none'");
    expect(SANDBOX_HTML_PREVIEW_CSP).toContain("form-action 'none'");
    expect(SANDBOX_HTML_PREVIEW_CSP).toContain("navigate-to 'none'");
    expect(SANDBOX_HTML_PREVIEW_CSP).toContain("frame-src 'none'");
  });
});
