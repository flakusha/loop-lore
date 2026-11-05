// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/integrations/loop-lore-facade/types.ts — the facade op contract.
//
// TASK-FACADE-SLICE-CHAT-AND-GENERATION-OPS (epic-agentic-integration-mcp-acp):
// one typed op registry that future MCP/ACP servers and the scoped REST
// surface all consume. Ops NEVER re-implement chat/generation logic — they
// delegate to the same services/routes the HTTP layer uses.

import type { TSchema, } from "@sinclair/typebox";
import type { Kysely, } from "kysely";
import type { RatePolicy, } from "../../api-governance/rate-limiting/policies";
import type { AsyncStore, } from "../../async/store";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import type { PrincipalKind, RequestContext, } from "../../middleware/types";

/** Access tier a facade op demands. Scoped API keys consume this (Q4 slice). */
export type FacadeScope = "read" | "chat-write";

/**
 * Server-resolved caller identity. TRUST BOUNDARY: a principal is NEVER
 * caller-supplied — op params cannot assert one, and the facade ignores any
 * principal-shaped field in a body (asserted in tests).
 */
export interface FacadePrincipal {
  readonly kind: PrincipalKind;
  readonly userId: string | null;
  readonly userRole: string | null;
  /**
   * Integration-token attribution (ADR admin-scoped slice): the token row a
   * principal resolved from — the audit row's tokenId/tokenName and the
   * per-token budget bucket key. Null for every other principal kind
   * (JWT users keep both facade tiers; tokens get their own buckets).
   */
  readonly credentialId: string | null;
  readonly credentialName: string | null;
  /** The token's granted FacadeScope tier; null for non-token principals. */
  readonly credentialScope: FacadeScope | null;
}

/** Everything an op handler receives; built from a verified RequestContext. */
export interface FacadeContext {
  readonly database: Kysely<DB>;
  readonly config: Config;
  readonly principal: FacadePrincipal;
  readonly requestId: string;
  readonly asyncStore?: AsyncStore;
}

/** Structured op outcome: the wrapped service's status + parsed JSON body. */
export type FacadeResult =
  | { ok: true; status: number; json: unknown }
  | { ok: false; status: number; json: unknown };

/** One registrable facade operation. */
export interface FacadeOp {
  /** Namespaced name (`chat.send`, `generation.generate`, ...). */
  readonly name: string;
  readonly domain: "chat" | "generation";
  /** Short summary — the future `tools/list` + docs-table single source. */
  readonly summary: string;
  readonly description: string;
  readonly scope: FacadeScope;
  /** Governance budget for the op, keyed on the principal. */
  readonly ratePolicy: RatePolicy;
  /**
   * The SAME TypeBox schema the wrapped route validates with, when one
   * exists (facade re-exports, never re-implements). Ops that pass the body
   * through to a handler doing its own authoritative validation omit this.
   */
  readonly bodySchema?: TSchema;
  readonly handler: (ctx: FacadeContext, body: unknown,) => Promise<FacadeResult>;
}

/** Manifest entry — schemas stay internal; descriptors feed discovery/docs. */
export interface FacadeOpDescriptor {
  readonly name: string;
  readonly domain: "chat" | "generation";
  readonly summary: string;
  readonly description: string;
  readonly scope: FacadeScope;
}

/**
 * Build a {@link FacadeContext} from the middleware's verified RequestContext.
 * This is the ONLY sanctioned way to mint a facade principal — the trust
 * boundary lives at this single assertion point.
 * @param rc - the RequestContext the auth middleware resolved
 * @param database - Kysely handle
 * @param config - app config
 * @param asyncStore - optional async request-result store
 * @returns the facade context carrying the server-resolved principal
 */
export function facadeContextFromRequestContext(
  rc: RequestContext,
  database: Kysely<DB>,
  config: Config,
  asyncStore?: AsyncStore,
): FacadeContext {
  return {
    database,
    config,
    asyncStore,
    requestId: rc.requestId,
    principal: {
      kind: rc.principalKind,
      userId: rc.userId,
      userRole: rc.userRole,
      credentialId: rc.credentialId,
      credentialName: rc.credentialName,
      // Narrow the middleware's string column back to the tier vocabulary;
      // anything unknown narrows to null (and an external-agent principal
      // with null scope is denied by authorizeFacadeOp — fail closed).
      credentialScope: toFacadeScope(rc.credentialScope,),
    },
  };
}

/** Narrow a stored scope string to the FacadeScope tier vocabulary. */
function toFacadeScope(value: string | null,): FacadeScope | null {
  return value === "read" || value === "chat-write" ? value : null;
}
