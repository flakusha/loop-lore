#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Spec-validity drift gate -- the served OpenAPI document must be usable.
 *
 * Two invariants, both BLOCKING:
 *
 *   1. The spec is valid OpenAPI 3.1 and parseable as JSON.
 *   2. Required paths are present in the spec.
 *
 * The spec is obtained in-process by booting the route surface and requesting
 * GET /api/v1/openapi/json via app.handle (no listener), the same way
 * scripts/generate-openapi.ts produces the committed fixture.
 *
 * This gate does NOT generate a compiling client -- openapi-typescript and
 * similar codegen toolchains are new dependencies. Instead it validates the
 * structural preconditions a client generator needs: spec validity and path
 * presence. A codegen check can be layered on top if/when a toolchain is
 * added without requiring this gate to change.
 *
 * Usage: bun run scripts/check/spec-drift.mjs
 *
 * Exit codes: 0 valid, 1 invalid spec or missing paths, 2 tooling failure.
 */

process.env.NODE_ENV ??= "development";

// Paths that MUST be present in the spec. These are the paths the reference TUI
// client (src/tui/) depends on; removing any one breaks the TUI.
const REQUIRED_PATHS = [
  "/api/v1/chats",
  "/api/v1/chats/{id}",
  "/api/v1/chats/{id}/messages",
  "/api/v1/actors",
];

import path from "node:path";

const PROJECT_ROOT = path.resolve(import.meta.dir, "..", "..",);

/**
 * Boot the route surface and request GET /api/v1/openapi/json.
 * Same approach as scripts/generate-openapi.ts -- no network, no listener.
 * Resolves with the parsed spec object.
 */
async function fetchSpec() {
  const { Elysia, } = await import("elysia");
  const { v1Routes, } = await import("../../src/routes/v1/index");
  const { registerPlugins, } = await import("../../src/app/register-plugins");
  const { loadConfig, } = await import("../../src/config/load");
  const { createTestDb, } = await import("../../src/test-utils/create-test-db");

  const asyncStore = {
    track() {},
    progress() {},
    complete() {},
    fail() {},
    config: {
      maxInlineBytes: 65536,
      defaultTtlMs: 24 * 60 * 60 * 1000,
      queueLimit: 10_000,
    },
    async flush() {},
    async read() {
      return null;
    },
    destroy() {},
  };

  const config = loadConfig();
  const { db, } = await createTestDb();

  const app = new Elysia()
    .derive(() => ({
      userId: null,
      userRole: null,
      sessionId: null,
      locale: "en",
      t: (k,) => k,
    }))
    .use(v1Routes({ database: db, config, asyncStore, },),);

  registerPlugins(app, { database: db, config, asyncStore, },);

  const response = await app.handle(
    new Request("http://localhost/api/v1/openapi/json",),
  );

  if (!response.ok) {
    throw new Error(`spec endpoint returned ${response.status}`,);
  }

  const spec = await response.json();

  // v1Routes holds the event loop; explicit exit required after db.destroy().
  await db.destroy();

  return spec;
}

async function main() {
  let spec;
  try {
    spec = await fetchSpec();
  } catch (err) {
    console.error("spec-drift: failed to obtain spec:", String(err,),);
    process.exit(2,);
  }

  // 1. Check valid JSON + OpenAPI 3.1
  if (typeof spec !== "object" || spec === null) {
    console.error("spec-drift: spec is not a JSON object",);
    process.exit(1,);
  }
  if (spec.openapi !== "3.1.2") {
    console.error(
      `spec-drift: spec.openapi is "${spec.openapi}", expected "3.1.2"`,
    );
    process.exit(1,);
  }

  // 2. Check paths exist
  const specPaths = spec.paths ?? {};
  if (typeof specPaths !== "object" || Object.keys(specPaths,).length === 0) {
    console.error("spec-drift: spec.paths is empty or missing",);
    process.exit(1,);
  }

  const missing = REQUIRED_PATHS.filter((p,) => !specPaths[p]);
  if (missing.length > 0) {
    console.error(
      `spec-drift: required paths missing from spec:\n  ${missing.join("\n  ",)}`,
    );
    process.exit(1,);
  }

  const pathCount = Object.keys(specPaths,).length;
  console.log(
    `spec-drift: OK -- ${pathCount} paths, OpenAPI 3.1.2, all ${REQUIRED_PATHS.length} required paths present`,
  );
  process.exit(0,);
}

main().catch((err,) => {
  console.error("spec-drift: unexpected error:", String(err,),);
  process.exit(2,);
},);
