// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Capability manifest — the machine-readable description of what the facade
 * can do. GENERATED from the facade op registry (the SAME registry the MCP
 * `tools/list` derives from), never a hand-written list: an op appears here
 * the moment it is registered, and the test counts the registry instead of a
 * fixed number.
 *
 * Per op the manifest publishes the descriptor (name, domain, summary,
 * description), the body schema, the output schema, the behaviour hints, the
 * required scope tier, and the rate policy name — everything a client needs
 * to decide whether it can call the op.
 *
 * AUTH: authenticated, like the facade's own manifest — the repo's rule is
 * "no anonymous discovery" (`integrations/loop-lore-facade/routes.ts`). The
 * guard fails closed for a request with no resolved principal, the handler
 * refuses one too, and the route is registered in the guard's
 * integration-agent allowlist so an integration-token principal can read it
 * too. The manifest exposes op names and schemas, never user data.
 */

import { Elysia, } from "elysia";
import { getFacadeRegistry, } from "../../integrations/loop-lore-facade/instance";
import type { FacadeOp, FacadeScope, } from "../../integrations/loop-lore-facade/types";
import { jsonResponse, requireUserId, } from "../http-utils";
import type { HandlerOpts, } from "../messages/types";

/**
 * JSON Schema of an op's body or its result — what a client validates
 * against. An op's TypeBox schema IS a JSON Schema, so it is published
 * verbatim; the index signature carries the keywords this interface does
 * not name (`format`, `enum`, ...).
 */
export interface CapabilitySchema {
  readonly type?: string;
  readonly properties?: Record<string, object>;
  readonly required?: string[];
  readonly additionalProperties?: boolean;
  readonly [keyword: string]: unknown;
}

/**
 * The MCP tool behaviour hints, materialized. A hint the op left unset keeps
 * the spec's default (readOnly false, destructive true, idempotent false),
 * so a client needs no spec knowledge to read the manifest.
 */
export interface CapabilityAnnotations {
  readonly readOnly: boolean;
  readonly destructive: boolean;
  readonly idempotent: boolean;
}

/** One registered op's capability entry. */
export interface CapabilityEntry {
  readonly name: string;
  readonly domain: FacadeOp["domain"];
  readonly summary: string;
  readonly description: string;
  readonly bodySchema: CapabilitySchema;
  readonly outputSchema: CapabilitySchema;
  readonly annotations: CapabilityAnnotations;
  readonly scope: FacadeScope;
  readonly ratePolicy: string;
}

/** The manifest body: one entry per registered op. */
export interface CapabilityManifest {
  readonly ops: readonly CapabilityEntry[];
}

/** The ctx fields this route reads (the app's auth derive populates them). */
interface CapabilityRouteCtx {
  userId?: string | null;
  /** Elysia always carries the query bag; this route reads none of it. */
  query?: Record<string, string>;
}

/**
 * The schema an op without a declared one advertises: any JSON object (the
 * op's handler validates authoritatively), the same permissive default the
 * MCP bridge publishes as `inputSchema`.
 */
const PERMISSIVE_SCHEMA: CapabilitySchema = { type: "object", additionalProperties: true, };

/**
 * Build one op's capability entry from the registry.
 * @param op - the registered op
 * @returns the entry the manifest publishes for it
 */
function capabilityEntry(op: FacadeOp,): CapabilityEntry {
  const hints = op.annotations;

  return {
    name: op.name,
    domain: op.domain,
    summary: op.summary,
    description: op.description,
    bodySchema: op.bodySchema ?? PERMISSIVE_SCHEMA,
    outputSchema: op.outputSchema ?? PERMISSIVE_SCHEMA,
    annotations: {
      readOnly: hints?.readOnlyHint ?? false,
      destructive: hints?.destructiveHint ?? true,
      idempotent: hints?.idempotentHint ?? false,
    },
    scope: op.scope,
    ratePolicy: op.ratePolicy.name,
  };
}

/**
 * Capability manifest route: `GET <prefix>/capabilities`.
 * @param opts - HandlerOpts threaded like every other route plugin
 * @param prefix - mount prefix (production: `/api/v1`)
 * @returns the Elysia plugin
 */
export function capabilityManifestRoutes(opts: HandlerOpts, prefix = "/api/v1",) {
  const { database, config, } = opts;

  return new Elysia({ name: "v1-capabilities", },)
    .get(`${prefix}/capabilities`, (ctx: CapabilityRouteCtx,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }

      const registry = getFacadeRegistry({ database, config, },);
      const ops = registry.manifest().flatMap((descriptor,) => {
        const op = registry.resolve(descriptor.name,);
        return op === undefined ? [] : [capabilityEntry(op,),];
      },);

      return jsonResponse({ ops, } satisfies CapabilityManifest,);
    },);
}
