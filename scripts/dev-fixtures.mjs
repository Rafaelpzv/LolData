#!/usr/bin/env node
// Starts `next dev` in fixtures mode: every API route and server action
// returns deterministic sample data (src/lib/fixtures), so no Supabase or
// Riot API key is needed.
//
// Usage: node scripts/dev-fixtures.mjs            (port 3100)
//        PORT=3101 node scripts/dev-fixtures.mjs
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = process.env.PORT || "3100";
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");

// next/image fetches CDN images server-side; Node 24's IPv6 happy-eyeballs
// default (250ms) times out on some networks, so give it more room.
const familyTimeout = "--network-family-autoselection-attempt-timeout=3000";
const nodeOptions = [process.env.NODE_OPTIONS, familyTimeout]
  .filter(Boolean)
  .join(" ");

const env = {
  ...process.env,
  USE_FIXTURES: "1",
  NODE_OPTIONS: nodeOptions,
  // The LoL profile page fetches its own /api/summoner/matches through this
  // base URL (it defaults to localhost:3000).
  NEXT_PUBLIC_SITE_URL:
    process.env.NEXT_PUBLIC_SITE_URL || `http://127.0.0.1:${port}`,
};

console.log(`[dev-fixtures] USE_FIXTURES=1 on http://localhost:${port}`);

const child = spawn(process.execPath, [nextBin, "dev", "-p", port], {
  cwd: root,
  env,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  process.exit(signal ? 1 : (code ?? 0));
});
