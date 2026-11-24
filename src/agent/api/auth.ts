// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 265

/**
 * RSI agent API token auth (TASK-recursive-self-improvement-agent-api-router-
 * and-token-scope-).
 *
 * `requireAgentScope(scope)` is the Elysia `beforeHandle` for every route on
 * the `/api/v1/agent/*` surface:
 *
 *   Authorization: Bearer <token>  ->  SHA-256 hex  ->  `agent_tokens` lookup
 *   ->  401 (missing / unknown / revoked / expired)  ->  429 (rate limit)
 *   ->  403 (valid token, wrong scope)  ->  continue with `ctx.agentToken`.
 *
 * At rest only the hash is stored; the plaintext exists for one response
 * (the admin mint) and is never logged — every log line carries the hash
 * prefix only (AGENTS.md security review 2026-08-25). Hash form matches
 * `middleware/auth/integration-token.ts:55` (the shared Bun.CryptoHasher
 * convention).
 */
import type { Kysely, } from "kysely";
import { randomBytes, } from "node:crypto";
import { AgentTokenScope, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { getChildLogger, } from "../../logger";
import { extractBearerToken, } from "../../middleware/auth/token";
import {
  createRateLimiter,
  type RateLimitConfig,
  type RateLimiter,
  rateLimitHeaders,
  type RateLimitResult,
} from "../../middleware/rate-limit";
import { forbiddenResponse, HttpStatus, unauthorizedResponse, } from "../../routes/http-utils";
import { toDate, } from "../../utils/date";
import { type AgentActionMarker, NO_AGENT_TOKEN_DIGEST, recordAgentAction, } from "../audit";

/** Wire prefix separating agent tokens from every other bearer shape. */
export const AGENT_TOKEN_PREFIX = "llra_";

/** Entropy: 32 random bytes -> 43 unpadded base64url chars (256-bit). */
const TOKEN_RANDOM_BYTES = 32;

/** Throttle window for `last_used_at` writes — mirrors integration_tokens. */
const LAST_USED_THROTTLE_MS = 5 * 60 * 1000;

/** Ticket default lifetime: 24 hours, applied when a mint omits `ttlMs`. */
export const AGENT_TOKEN_DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

/** Options for minting: lifetime is issuance policy, not a token shape. */
export interface MintAgentTokenOptions {
  /** Positive finite lifetime in milliseconds (default: 24h). */
  ttlMs?: number;
}

/** Per-ticket budgets: 60 req/min per token, 600 req/min global. */
export const AGENT_RATE_LIMITS: Readonly<{
  perToken: RateLimitConfig;
  global: RateLimitConfig;
}> = {
  perToken: { windowMs: 60_000, maxRequests: 60, },
  global: { windowMs: 60_000, maxRequests: 600, },
};

/** The columns a resolved agent token carries into the request context. */
export interface ResolvedAgentToken {
  readonly id: string;
  readonly scope: AgentTokenScope;
}

/** Injection seams for tests and embedders; production uses fresh limiters. */
export interface AgentAuthDeps {
  database: Kysely<DB>;
  /** Overrides the 60/min per-token limiter (test seam). */
  perTokenLimiter?: RateLimiter;
  /** Overrides the 600/min global limiter (test seam). */
  globalLimiter?: RateLimiter;
}

/**
 * Hash a raw agent token to the stored SHA-256 hex fingerprint. Same
 * Bun.CryptoHasher form as `middleware/auth/integration-token.ts`
 * (sessions.secret_hash / integration_tokens.token_hash).
 * @param rawToken - the plaintext bearer value (`llra_...`)
 * @returns the hex SHA-256 of the raw token
 */
export function hashAgentToken(rawToken: string,): string {
  return new Bun.CryptoHasher("sha256",).update(rawToken,).digest("hex",);
}

/** Short audit label for the sub-route a request targeted. */
function agentActionName(request: Request,): string {
  const pathname = new URL(request.url,).pathname;
  const marker = "/agent/";
  const at = pathname.indexOf(marker,);
  return at === -1 ? pathname : (pathname.slice(at + marker.length,) || "unknown");
}

/**
 * Mint a fresh agent token: `llra_<32 random urlsafe base64 bytes>`.
 * The raw value is returned ONCE and only its hash may be persisted.
 * @param options - optional lifetime override (default: 24h)
 * @returns plaintext, hash and the stamped UTC expiry instant
 * @throws {RangeError} when ttlMs is not positive finite, or too large to stamp
 */
export function mintAgentToken(
  options: MintAgentTokenOptions = {},
): { raw: string; hash: string; expiresAt: string } {
  const ttlMs = options.ttlMs ?? AGENT_TOKEN_DEFAULT_TTL_MS;
  if (!Number.isFinite(ttlMs,) || ttlMs <= 0) {
    throw new RangeError("ttlMs must be a positive finite number of milliseconds",);
  }

  const expiresAt = toDate(Date.now() + ttlMs,);
  if (Number.isNaN(expiresAt.getTime(),)) {
    throw new RangeError("ttlMs produces an unrepresentable expiry instant",);
  }

  const raw = `${AGENT_TOKEN_PREFIX}${randomBytes(TOKEN_RANDOM_BYTES,).toString("base64url",)}`;
  return { raw, hash: hashAgentToken(raw,), expiresAt: expiresAt.toISOString(), };
}

/**
 * Verify a presented agent token fail-closed.
 * @param database - Kysely handle
 * @param rawToken - the presented bearer value (`llra_...`)
 * @returns the resolved row, or null when unknown, revoked, expired or
 * carrying an unparseable expiry
 */
export async function verifyAgentToken(
  database: Kysely<DB>,
  rawToken: string,
): Promise<ResolvedAgentToken | null> {
  const log = getChildLogger("agent.auth",);
  const hash = hashAgentToken(rawToken,);
  const row = await database
    .selectFrom("agent_tokens",)
    .select(["id", "scope", "revoked_at", "last_used_at", "expires_at",],)
    .where("token_hash", "=", hash,)
    .executeTakeFirst();

  if (!row) {
    log?.debug("agent token unknown", { hashPrefix: hash.slice(0, 8,), },);
    return null;
  }

  if (row.revoked_at !== null) {
    log?.debug("agent token revoked", { tokenId: row.id, hashPrefix: hash.slice(0, 8,), },);
    return null;
  }

  // A NULL expiry is a pre-policy credential: fail closed like the
  // integration-token sibling, never an eternal bearer. Only canonical ISO
  // instants (the mint's toISOString output) count: a loose string such as
  // "12/31/9999" parses to a future date and must not extend a lifetime.
  // Absent, malformed, unparseable or past expiries all fail closed into the
  // guard's existing 401, before the usage stamp.
  if (row.expires_at === null) {
    log?.debug("agent token has no expiry", { tokenId: row.id, },);
    return null;
  }

  const expiresAt = toDate(row.expires_at,);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(row.expires_at,) ||
    Number.isNaN(expiresAt.getTime(),) ||
    expiresAt.getTime() <= Date.now()
  ) {
    log?.debug("agent token expired or malformed expiry", { tokenId: row.id, },);
    return null;
  }

  // Runtime scope validation: a legacy/foreign row must not smuggle an
  // unchecked value past the type system (F-02). Deny before the stamp.
  const scope = Object.values(AgentTokenScope,).find((candidate,) => candidate === row.scope);
  if (scope === undefined) {
    log?.debug("agent token has an invalid scope", { tokenId: row.id, },);
    return null;
  }

  // Throttled usage stamp (audit hygiene, not a security decision). A
  // never-used row has NULL last_used_at — `NULL < x` never matches in
  // SQLite, so the stamp must ALSO fire on the NULL row or first use would
  // never be recorded (same shape as verifyIntegrationToken).
  try {
    const nowIso = new Date().toISOString();
    const fiveMinutesAgo = toDate(Date.now() - LAST_USED_THROTTLE_MS,).toISOString();
    await database
      .updateTable("agent_tokens",)
      .set({ last_used_at: nowIso, },)
      .where("id", "=", row.id,)
      .where((eb,) => eb.or([eb("last_used_at", "<", fiveMinutesAgo,), eb("last_used_at", "is", null,),],))
      .execute();
  } catch (err) {
    log?.warn("failed to update agent token last_used_at", { tokenId: row.id, err, },);
  }

  return { id: row.id, scope, };
}

/** Build the 429 response with the shared X-RateLimit-* headers. */
function rateLimitedResponse(result: RateLimitResult,): Response {
  return new Response(null, {
    status: HttpStatus.TooManyRequests,
    headers: rateLimitHeaders(result, result.resetSec,),
  },);
}

/**
 * Build the agent-surface guard. `null` scope accepts ANY valid token
 * (identity probe); a named scope enforces the exact tier.
 * @param requiredScope - the scope a token must carry, or null for any
 * @param deps - database handle plus optional limiter seams
 * @returns an Elysia beforeHandle: undefined to continue, Response to reject
 */
function agentTokenGuard(
  requiredScope: AgentTokenScope | null,
  deps: AgentAuthDeps,
): (ctx: any,) => Promise<Response | undefined> {
  const log = getChildLogger("agent.auth",);
  // Per-mount instances (same default-overridable-seam shape as the
  // telemetry surface), so tests get independent budgets.
  const perToken = deps.perTokenLimiter ?? createRateLimiter(AGENT_RATE_LIMITS.perToken,);
  const global = deps.globalLimiter ?? createRateLimiter(AGENT_RATE_LIMITS.global,);

  // `(ctx: any)` mirrors the route-level hook seam in routes/v1/governance.ts
  // — Elysia's handler context is only structurally known inside the
  // framework; the guard narrows to request + token carrier itself.
  return async (ctx: any,) => {
    const request = ctx.request as Request;
    const startedAt = Date.now();
    const action = agentActionName(request,);
    const raw = extractBearerToken(request,);
    // One digest per request; the plaintext bearer never leaves this guard.
    const digest = raw ? hashAgentToken(raw,).slice(0, 16,) : NO_AGENT_TOKEN_DIGEST;
    if (!raw) {
      log?.debug("agent request missing bearer token", {},);
      await recordAgentAction(deps.database, {
        tokenDigest: digest,
        action,
        result: "denied",
        durationMs: Date.now() - startedAt,
      },);

      return unauthorizedResponse("agent token required",);
    }

    // 401 covers missing/unknown/revoked alike — never reveal which.
    const token = await verifyAgentToken(deps.database, raw,);
    if (!token) {
      log?.debug("agent token rejected", { hashPrefix: digest.slice(0, 8,), },);
      await recordAgentAction(deps.database, {
        tokenDigest: digest,
        action,
        result: "denied",
        durationMs: Date.now() - startedAt,
      },);

      return unauthorizedResponse("invalid agent token",);
    }

    // Global budget first: one flooding token must not squeeze the shared
    // window only after per-token accounting.
    const globalResult = global.consume("global",);
    if (!globalResult.allowed) {
      await recordAgentAction(deps.database, {
        tokenDigest: digest,
        action,
        result: "rate_limited",
        durationMs: Date.now() - startedAt,
      },);

      return rateLimitedResponse(globalResult,);
    }

    const tokenResult = perToken.consume(`token:${token.id}`,);
    if (!tokenResult.allowed) {
      await recordAgentAction(deps.database, {
        tokenDigest: digest,
        action,
        result: "rate_limited",
        durationMs: Date.now() - startedAt,
      },);

      return rateLimitedResponse(tokenResult,);
    }

    if (requiredScope !== null && token.scope !== requiredScope) {
      log?.debug("agent token off-scope", {
        tokenId: token.id,
        hashPrefix: digest.slice(0, 8,),
        requiredScope,
        tokenScope: token.scope,
      },);

      await recordAgentAction(deps.database, {
        tokenDigest: digest,
        action,
        result: "forbidden",
        durationMs: Date.now() - startedAt,
      },);

      return forbiddenResponse("token lacks required scope",);
    }

    const auditId = await recordAgentAction(deps.database, {
      tokenDigest: digest,
      action,
      result: "allowed",
    },);

    ctx.agentToken = token;
    if (auditId !== null) {
      (ctx as { __agentAudit?: AgentActionMarker }).__agentAudit = { auditId, startedAt, };
    }

    return undefined;
  };
}

/**
 * Guard factory for scope-gated agent routes.
 * @param requiredScope - exact scope a token must carry
 * @param deps - database handle plus optional limiter seams
 * @returns an Elysia beforeHandle (401 missing/invalid, 429 over budget,
 * 403 valid token without the scope)
 */
export function requireAgentScope(
  requiredScope: AgentTokenScope,
  deps: AgentAuthDeps,
): (ctx: any,) => Promise<Response | undefined> {
  return agentTokenGuard(requiredScope, deps,);
}

/**
 * Guard factory for scope-agnostic agent routes (identity probe): any valid,
 * unrevoked token passes regardless of tier.
 * @param deps - database handle plus optional limiter seams
 * @returns an Elysia beforeHandle
 */
export function requireAgentToken(
  deps: AgentAuthDeps,
): (ctx: any,) => Promise<Response | undefined> {
  return agentTokenGuard(null, deps,);
}
