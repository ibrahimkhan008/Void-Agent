import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(here, "..");
const projectRoot = path.resolve(desktopRoot, "..", "..");
await mkdir(path.join(desktopRoot, "dist", "main"), { recursive: true });
await mkdir(path.join(desktopRoot, "dist", "preload"), { recursive: true });

await build({
  entryPoints: [path.join(desktopRoot, "src", "main", "index.ts")],
  outfile: path.join(desktopRoot, "dist", "main", "index.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  external: ["electron", "electron-updater"],
  sourcemap: true,
  define: {
    "process.env.VOID_AGENT_WEB_URL": JSON.stringify(
      process.env.VOID_AGENT_WEB_URL || process.env.NEXT_PUBLIC_BASE_URL || "",
    ),
  },
  absWorkingDir: projectRoot,
});
await build({
  entryPoints: [path.join(desktopRoot, "src", "preload", "index.ts")],
  outfile: path.join(desktopRoot, "dist", "preload", "index.js"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["electron"],
  sourcemap: true,
  absWorkingDir: projectRoot,
});
await build({
  entryPoints: [path.join(desktopRoot, "src", "preload", "server-picker.ts")],
  outfile: path.join(desktopRoot, "dist", "preload", "server-picker.js"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["electron"],
  sourcemap: true,
  absWorkingDir: projectRoot,
});
