// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Versioned OpenAPI spec (FEAT-039).
 *
 * Builds a versioned OpenAPI 3.1 document from registered Elysia route schemas
 * (`detail.summary`, `detail.tags`, `response`, `body`, `query`). Mounted
 * automatically in the v1 barrel to serve `GET /api/v1/openapi` (Scalar UI)
 * and `GET /api/v1/openapi/json` (JSON spec).
 * @see docs/spec/api-versioning.md
 */

/** Options for building a versioned OpenAPI document. */
export interface VersionedOpenApiOptions {
  /** API version, e.g. `"1"` → served under `/api/v1`. */
  version: string;
  /** Human-readable API title. */
  title?: string;
}

/** Minimal OpenAPI 3.1 document shape. */
export interface VersionedOpenApiSpec {
  openapi: string;
  info: {
    title: string;
    version: string;
  };
  servers: Array<{
    url: string;
  }>;
  paths: Record<string, unknown>;
}

const DEFAULT_TITLE = "Loop Lore API";

/**
 * Build an empty-but-valid versioned OpenAPI document.
 *
 * Envelope only — no paths are collected. Route-level schema registration
 * fills `paths` at request time via the `@elysia/openapi` plugin.
 * @param options - Version and optional title.
 * @returns OpenAPI 3.1 document with versioned server URL and empty paths.
 * @example
 * const spec = buildVersionedOpenApiSpec({ version: "1" });
 * // spec.servers[0].url === "/api/v1"
 */
export function buildVersionedOpenApiSpec(
  options: VersionedOpenApiOptions,
): VersionedOpenApiSpec {
  return {
    openapi: "3.1.0",
    info: {
      title: options.title ?? DEFAULT_TITLE,
      version: options.version,
    },
    servers: [
      { url: `/api/v${options.version}`, },
    ],
    paths: {},
  };
}

import { openapi as createOpenApiPlugin, } from "@elysia/openapi";
import type { Elysia, } from "elysia";

/**
 * Create an Elysia sub-plugin that mounts `@elysiajs/openapi` configured
 * for one API version.
 *
 * The plugin is mounted inside the v1 barrel (which uses `.use()` not a
 * constructor `prefix`). To produce `GET /api/v1/openapi` and
 * `GET /api/v1/openapi/json`, the `path` and `specPath` must include the
 * versioned prefix explicitly.
 * @param opts - Version string and optional title.
 * @returns Elysia plugin that serves the versioned OpenAPI spec.
 * @example
 * app.use(versionedOpenApiPlugin({ version: "1", }));
 * // → GET /api/v1/openapi      — Scalar UI
 * // → GET /api/v1/openapi/json — JSON spec
 */
export function versionedOpenApiPlugin(
  opts: VersionedOpenApiOptions,
): Elysia {
  const spec = buildVersionedOpenApiSpec(opts);
  const versionedPath = `/api/v${opts.version}`;

  return createOpenApiPlugin({
    path: `${versionedPath}/openapi`,
    specPath: `${versionedPath}/openapi/json`,
    provider: "scalar",
    documentation: {
      info: spec.info,
      servers: spec.servers,
    },
  });
}
