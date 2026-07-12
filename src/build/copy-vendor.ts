#!/usr/bin/env bun
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "../logger";

const log = createLogger({ level: "info" });
const NM = join(import.meta.dir, "..", "..", "node_modules");
const DIST = process.argv[2] ?? join(import.meta.dir, "..", "..", "dist", "public");
const TARGET = join(DIST, "js");

const VENDOR_FILES: { from: string; to: string }[] = [
  { from: "htmx.org/dist/htmx.min.js", to: "htmx.min.js" },
  { from: "alpinejs/dist/cdn.min.js", to: "alpine.min.js" },
  { from: "@alpinejs/morph/dist/cdn.min.js", to: "alpine-morph.min.js" },
  { from: "htmx.org/dist/ext/alpine-morph.js", to: "htmx-alpine-morph.min.js" },
  { from: "htmx.org/dist/ext/response-targets.js", to: "htmx-response-targets.min.js" },
  { from: "htmx.org/dist/ext/sse.js", to: "htmx-sse.min.js" },
];

if (!existsSync(TARGET)) {
  mkdirSync(TARGET, { recursive: true });
}

let total = 0;
for (const { from, to } of VENDOR_FILES) {
  const src = join(NM, from);
  const dest = join(TARGET, to);
  if (!existsSync(src)) {
    log.error(`Vendor file not found: ${src}`);
    process.exit(1);
  }
  copyFileSync(src, dest);
  total++;
}

log.info(`Copied ${total} vendor files to ${TARGET}`);
