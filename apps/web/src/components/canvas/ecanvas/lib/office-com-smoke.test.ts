import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Office COM smoke-open drill (§3.6 Canvas closure): the real eCanvas export
 * modules produce REAL PPTX/DOCX files, and this drill opens them in the
 * actual Microsoft Office applications via COM automation — the exact check
 * the ledger called outstanding ("generated Office files never smoke-opened
 * in Office"). Opt-in because it needs Windows + Office installed and is
 * slow: run with OFFICE_COM_SMOKE=1. No AI key is involved — the frames are
 * real PNGs from the repo's public assets.
 */

const execFileAsync = promisify(execFile);

const enabled =
  process.env.OFFICE_COM_SMOKE === "1" && process.platform === "win32";
const smoke = enabled ? describe : describe.skip;

// DOM shims — the export modules size images via new Image() and save via a
// synthetic anchor; this test captures the produced Blobs instead of
// downloading them (same pattern as office-export.test.ts, but keeps bytes).
const captured: Array<{ blob: Blob; fileName: string }> = [];

vi.stubGlobal(
  "Image",
  class {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 640;
    naturalHeight = 400;
    set src(_value: string) {
      // Every repo PNG is valid; resolve synchronously with fixed geometry.
      if (this.onload) this.onload();
    }
  },
);
vi.stubGlobal("document", {
  createElement: () => ({
    href: "",
    download: "",
    click: () => {},
  }),
});
vi.stubGlobal("window", { setTimeout: () => {} });
vi.stubGlobal("URL", {
  createObjectURL: (blob: Blob) => {
    captured.push({
      blob,
      // download() runs after createObjectURL; the anchor's download name is
      // patched in below via the link object identity — instead, name files
      // by call order (pptx first, docx second) from the callers.
      fileName: "",
    });
    return `blob:capture-${captured.length}`;
  },
  revokeObjectURL: () => {},
});

import { exportImagesAsDocx, exportImagesAsPptx } from "./office-export";

let workDir: string;

const frameFor = (name: string) => ({
  base64: readFileSync(join(process.cwd(), "public", name)).toString("base64"),
  label: name,
});

/** Runs a PowerShell COM script and returns its captured output lines. */
async function runPowerShell(script: string): Promise<string> {
  const scriptPath = join(workDir, "check.ps1");
  writeFileSync(scriptPath, script, "utf8");
  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
    { timeout: 180_000 },
  );
  return stdout;
}

beforeEach(() => {
  captured.length = 0;
  mkdirSync(workDir, { recursive: true });
});

smoke("Office COM smoke-open of real eCanvas exports", () => {
  workDir = join(tmpdir(), `canvas-office-smoke-${Date.now()}`);
  const pptxPath = join(workDir, "canvas.pptx");
  const docxPath = join(workDir, "canvas.docx");

  afterAll(async () => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it("generates a real PPTX that PowerPoint opens with the expected slides", async () => {
    const images = [frameFor("p1.png"), frameFor("p2.png")];
    expect(await exportImagesAsPptx(images, "canvas")).toBe(true);
    expect(captured).toHaveLength(1);
    const bytes = Buffer.from(await captured[0].blob.arrayBuffer());
    expect(bytes.length).toBeGreaterThan(10_000);
    // PPTX files start with the OLE/ZIP signature (PK).
    expect(bytes.subarray(0, 2).toString("latin1")).toBe("PK");
    writeFileSync(pptxPath, bytes);

    const output = await runPowerShell(`
$ErrorActionPreference = "Stop"
$app = New-Object -ComObject PowerPoint.Application
try {
  $pres = $app.Presentations.Open("${pptxPath.replace(/\\/g, "\\\\")}", $true, $false, $false)
  Write-Output ("SLIDES=" + $pres.Slides.Count)
  foreach ($slide in $pres.Slides) {
    $pictures = 0
    foreach ($shape in $slide.Shapes) {
      if ($shape.Type -eq 13) { $pictures += 1 }
    }
    Write-Output ("PICTURES=" + $pictures)
  }
  $pres.Close()
} finally {
  $app.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($app) | Out-Null
}
`);
    expect(output).toContain("SLIDES=2");
    expect(output.match(/PICTURES=1/g)).toHaveLength(2);
  }, 240_000);

  it("generates a real DOCX that Word opens with labels and embedded images", async () => {
    const images = [
      { base64: frameFor("p1.png").base64, label: "Frame One" },
      { base64: frameFor("p2.png").base64, label: "Frame Two" },
    ];
    expect(await exportImagesAsDocx(images, "canvas")).toBe(true);
    expect(captured).toHaveLength(1);
    const bytes = Buffer.from(await captured[0].blob.arrayBuffer());
    expect(bytes.subarray(0, 2).toString("latin1")).toBe("PK");
    writeFileSync(docxPath, bytes);

    const output = await runPowerShell(`
$ErrorActionPreference = "Stop"
$word = New-Object -ComObject Word.Application
$word.Visible = $false
try {
  $doc = $word.Documents.Open("${docxPath.replace(/\\/g, "\\\\")}", $false, $true)
  Write-Output ("INLINESHAPES=" + $doc.InlineShapes.Count)
  $text = $doc.Content.Text
  Write-Output ("HAS_FRAME_ONE=" + $text.Contains("Frame One"))
  Write-Output ("HAS_FRAME_TWO=" + $text.Contains("Frame Two"))
  $doc.Close($false)
} finally {
  $word.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}
`);
    expect(output).toContain("INLINESHAPES=2");
    expect(output).toContain("HAS_FRAME_ONE=True");
    expect(output).toContain("HAS_FRAME_TWO=True");
  }, 240_000);
});
