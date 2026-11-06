import { spawn } from "node:child_process";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(here, "..");
const projectRoot = path.resolve(desktopRoot, "..", "..");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const env = { ...process.env, NODE_ENV: "development", VOID_AGENT_WEB_URL: process.env.VOID_AGENT_WEB_URL || "http://localhost:3000" };
const server = spawn(pnpm, ["dev"], { cwd: projectRoot, env, stdio: "inherit", shell: process.platform === "win32" });
let ready = false;
for (let i = 0; i < 120; i++) {
  if (server.exitCode !== null) throw new Error("Void-Agent web server exited before it became ready");
  try { const response = await fetch(env.VOID_AGENT_WEB_URL); if (response.status < 500) { ready = true; break; } } catch { /* wait for Next.js */ }
  await delay(1_000);
}
if (!ready) { server.kill(); throw new Error("Timed out waiting for the Void-Agent web server"); }
const build = spawn(pnpm, ["build"], { cwd: desktopRoot, env, stdio: "inherit", shell: process.platform === "win32" });
const buildCode = await new Promise((resolve) => build.on("exit", resolve));
if (buildCode !== 0) { server.kill(); process.exitCode = Number(buildCode ?? 1); }
else {
  const electron = spawn(pnpm, ["exec", "electron", "."], { cwd: desktopRoot, env, stdio: "inherit", shell: process.platform === "win32" });
  await new Promise((resolve) => electron.on("exit", resolve));
  server.kill();
}
