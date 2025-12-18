#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const shouldSkip =
  process.env.npm_config_global === "true" || process.env.IS_THIS_CI_SKIP_VERSION_BUMP === "true";

if (shouldSkip) {
  process.exit(0);
}

const pkgPath = resolve(process.cwd(), "package.json");
const raw = readFileSync(pkgPath, "utf8");
const pkg = JSON.parse(raw);
const current = String(pkg.version ?? "0.0.0");
const parts = current.split(".").map((value) => Number(value));

if (parts.length !== 3 || parts.some((value) => Number.isNaN(value))) {
  throw new Error(`Unsupported version format: ${current}`);
}

parts[2] += 1;
pkg.version = parts.join(".");

writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
