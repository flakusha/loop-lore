#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Generate OpenAPI spec from the running Elysia app.
 *
 * Usage:  bun run scripts/gen-openapi.ts
 * Output: docs/reference/openapi.json
 *
 * Starts the server briefly, fetches /openapi/json, writes the spec, exits.
 */
import { existsSync, mkdirSync, writeFileSync, } from "node:fs";
import { join, } from "node:path";
import { loadConfig, } from "../src/config/load";
import { createApp, } from "../src/elysia-app";

const PORT = 19_876;
const OUT_PATH = join(import.meta.dir, "..", "docs", "reference", "openapi.json",);

async function main() {
  // Load config and force docs.enabled = true for spec generation
  const config = loadConfig();
  const genConfig = {
    ...config,
    docs: { ...config.docs, enabled: true, },
  };

  // Minimal deps — database not needed for spec generation
  const noopHandle = async () => new Response("not found", { status: 404, },);

  const app = createApp({
    database: null as never,
    config: genConfig,
    handleNonApiRequest: noopHandle,
  },);

  // Start server on random available port
  const server = app.listen(PORT,);

  try {
    const res = await fetch(`http://localhost:${PORT}/openapi/json`,);
    if (!res.ok) {
      throw new Error(`Failed to fetch OpenAPI spec: ${res.status} ${res.statusText}`,);
    }
    const spec = await res.json();

    // Ensure output directory exists
    const outDir = join(import.meta.dir, "..", "docs", "reference",);
    if (!existsSync(outDir,)) {
      mkdirSync(outDir, { recursive: true, },);
    }

    writeFileSync(OUT_PATH, JSON.stringify(spec, null, 2,) + "\n",);
    console.log(`✓ OpenAPI spec written to ${OUT_PATH}`,);
    console.log(
      `  ${(JSON.stringify(spec,).length / 1024).toFixed(1,)} KB, ${Object.keys(spec.paths ?? {},).length} paths`,
    );
  } finally {
    server.stop(true,);
  }
}

main().catch((err,) => {
  console.error("Failed to generate OpenAPI spec:", err,);
  process.exit(1,);
},);
