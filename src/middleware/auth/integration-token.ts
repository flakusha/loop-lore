// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Integration-token verification seam (ADR-credentials-issuer-model,
 * admin-scoped slice — server-provided capability for integration clients).
 *
 * SIBLING of `authenticate()` + `requireAuthGuard` (never a parallel auth
 * path): a presented `llri_` bearer resolves against the `integration_tokens`
 * table — hash lookup, revoked/expired/unknown fail closed — and yields a
 * RequestContext with `principalKind: "external-agent"`. SUBJECT BINDING
 * DECISION: the token is attributed to the ISSUING ADMIN's userId (no
 * synthetic user rows; every audit row and budget attribution lands on an
 * accountable account), with `userRole: null` so the token principal never
 * inherits the issuer's RBAC powers. Fail-closed rule mirrors the JWT path:
 * a presented-but-invalid token NEVER falls back to the solo identity.
 *
 * Surface confinement: a token principal reaches ONLY the integration-agent
 * surfaces (`isIntegrationAgentPath`, shared with `requireAuthGuard`).
 */
import type { Kysely, } from "kysely";
import { randomBytes, } from "node:crypto";
import type { IntegrationTokenScope, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { getChildLogger, } from "../../logger/index";
import { parseExpiryMs, toDate, } from "../../utils/date";
import { isIntegrationAgentPath, } from "../require-auth-guard";
import type { RequestContext, } from "../types";
import { createRequestContext, } from "../types";
import { extractBearerToken, } from "./token";

/** Wire prefix separating integration tokens from every other bearer shape. */
export const INTEGRATION_TOKEN_PREFIX = "llri_";

/** Entropy: 32 random bytes -> 43 unpadded base64url chars (256-bit). */
const TOKEN_RANDOM_BYTES = 32;

/** Throttle window for `last_used_at` writes — mirrors users.last_seen_at. */
const LAST_USED_THROTTLE_MS = 5 * 60 * 1000;

/** The columns a resolved token principal carries into the context. */
export interface ResolvedIntegrationToken {
  readonly id: string;
  readonly name: string;
  readonly scopes: IntegrationTokenScope;
  readonly issuerAdminUserId: string;
}

/** Why a presented integration token was refused (fail-closed reasons). */
export type IntegrationTokenRejection = "unknown" | "revoked" | "expired" | "off-surface";

/** Hash a raw integration token to the stored SHA-256 hex fingerprint. Same
 * Bun.CryptoHasher form as `middleware/auth/token.ts` (sessions.secret_hash). */
export function hashIntegrationToken(rawToken: string,): string {
  return new Bun.CryptoHasher("sha256",).update(rawToken,).digest("hex",);
}

/**
 * Mint a fresh integration token: `llri_<32 random urlsafe base64 bytes>`.
 * The raw value is returned EXACTLY ONCE (POST response body) — only the
 * hash is persisted.
 * @returns the raw bearer value and its stored hash
 */
export function mintIntegrationToken(): { raw: string; hash: string } {
  const raw = `${INTEGRATION_TOKEN_PREFIX}${randomBytes(TOKEN_RANDOM_BYTES,).toString("base64url",)}`;
  return { raw, hash: hashIntegrationToken(raw,), };
}

/**
 * Verify a presented integration token fail-closed.
 * @param database - Kysely handle
 * @param rawToken - the presented bearer value (`llri_...`)
 * @returns the resolved row, or null when unknown/revoked/expired
 */
export async function verifyIntegrationToken(
  database: Kysely<DB>,
  rawToken: string,
): Promise<ResolvedIntegrationToken | null> {
  const log = getChildLogger("auth.integration-token",);
  const row = await database
    .selectFrom("integration_tokens",)
    .select(["id", "name", "scopes", "issuer_admin_user_id", "revoked_at", "expires_at", "last_used_at",],)
    .where("token_hash", "=", hashIntegrationToken(rawToken,),)
    .executeTakeFirst();

  if (!row) { return null; } // unknown — hash miss
  if (row.revoked_at !== null) {
    log?.debug("integration token revoked", { tokenId: row.id, },);
    return null;
  }

  // Expiry is OPTIONAL (default-non-expiring, pending the open ADR lifetime
  // question). A PRESENT (non-null) but unparseable value is a corrupt row —
  // fail closed, never "eternal" (mirrors sessions.expires_at handling).
  if (row.expires_at !== null) {
    const expiresMs = parseExpiryMs(row.expires_at,);
    if (expiresMs === null || expiresMs <= Date.now()) {
      log?.debug("integration token expired", { tokenId: row.id, },);
      return null;
    }
  }

  // Throttled usage stamp (audit hygiene, not a security decision). A
  // never-used row has NULL last_used_at — `NULL < x` never matches in
  // SQLite, so the stamp must ALSO fire on the NULL row or first use would
  // never be recorded.
  try {
    const nowIso = new Date().toISOString();
    const fiveMinutesAgo = toDate(Date.now() - LAST_USED_THROTTLE_MS,).toISOString();
    await database
      .updateTable("integration_tokens",)
      .set({ last_used_at: nowIso, },)
      .where("id", "=", row.id,)
      .where((eb,) => eb.or([eb("last_used_at", "<", fiveMinutesAgo,), eb("last_used_at", "is", null,),],))
      .execute();
  } catch (err) {
    log?.warn("failed to update last_used_at", { tokenId: row.id, err, },);
  }

  return {
    id: row.id,
    name: row.name,
    scopes: row.scopes as IntegrationTokenScope,
    issuerAdminUserId: row.issuer_admin_user_id,
  };
}

/** Outcome of the integration-token branch of the auth chain. */
export type IntegrationTokenAuthResult =
  | { kind: "not-integration-token" }
  | { kind: "rejected"; reason: IntegrationTokenRejection }
  | { kind: "resolved"; token: ResolvedIntegrationToken };

/**
 * Resolve the presented bearer as an integration token, or defer to the JWT
 * chain. A non-`llri_` bearer (or no bearer) returns
 * `not-integration-token` and the caller proceeds with `authenticate()` —
 * the JWT path is untouched. An `llri_` bearer resolves ONLY on the
 * integration-agent surfaces; anywhere else it is `off-surface` so the
 * caller rejects fail-closed instead of ever reaching the solo fallback.
 * @param opts - request + database handle
 * @returns the branch outcome
 */
export async function resolveIntegrationTokenAuth(opts: {
  request: Request;
  database: Kysely<DB>;
},): Promise<IntegrationTokenAuthResult> {
  const bearer = extractBearerToken(opts.request,);
  if (bearer === null || !bearer.startsWith(INTEGRATION_TOKEN_PREFIX,)) {
    return { kind: "not-integration-token", };
  }

  if (!isIntegrationAgentPath(new URL(opts.request.url,).pathname,)) {
    return { kind: "rejected", reason: "off-surface", };
  }

  const token = await verifyIntegrationToken(opts.database, bearer,);
  if (token === null) {
    return { kind: "rejected", reason: "unknown", };
  }

  return { kind: "resolved", token, };
}

/**
 * Build the external-agent RequestContext for a resolved token row.
 * SUBJECT BINDING: userId = the ISSUING ADMIN's id (auditable attribution,
 * no synthetic user rows); userRole = null so the token never inherits the
 * issuer's RBAC; sessionId = null (no session row exists). The request id is
 * attached by the caller (mirrors `facadeContextFromRequestContext` usage).
 * @param token - the verified token row
 * @returns the RequestContext for the external-agent principal
 */
export function integrationTokenContext(token: ResolvedIntegrationToken,): RequestContext {
  return createRequestContext({
    userId: token.issuerAdminUserId,
    userRole: null,
    sessionId: null,
    principalKind: "external-agent",
    credentialId: token.id,
    credentialName: token.name,
    credentialScope: token.scopes,
  },);
}
