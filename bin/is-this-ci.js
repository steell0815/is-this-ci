#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..");
const cliPath = resolve(projectRoot, "dist", "cli.js");

if (!existsSync(cliPath)) {
  console.error("Missing dist/cli.js. Run: npm run build");
  process.exit(1);
}

const result = spawnSync(process.execPath, [cliPath, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: {
    ...process.env,
    IS_THIS_CI_ROOT: projectRoot
  }
});

process.exit(result.status ?? 1);
