// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * v1 integrationsSurface — inbound webhook ingestion (spec §3 webhook row,
 * §10 default-deny).
 *
 * POST /api/v1/integrations/webhooks/:adapter
 *
 * Auth model: per-adapter shared secret (raw value or `secret:` reference)
 * resolved via `resolveCredential` at request time; the caller proves
 * knowledge of it with `x-loop-lore-signature` = hex HMAC-SHA256 over the
 * RAW request bytes. The signature verifies BEFORE the payload is parsed —
 * an unauthenticated request is never processed (default-deny).
 *
 * Moderation is the bridge's concern (createMessageBridge({ moderationGate })),
 * not the route's: this surface only normalizes and hands off to
 * MessageBridge.receive.
 */

import { Value, } from "@sinclair/typebox/value";
import { Elysia, t, } from "elysia";
import { createHmac, timingSafeEqual, } from "node:crypto";
import type { RegisterPluginsOpts, } from "../../app/register-plugins";
import type { AdapterMessage, MessageBridge, } from "../../integrations";
import { resolveCredential, } from "../../integrations";
import type { RateLimitConfig, RateLimiter, } from "../../middleware/rate-limit";
import { createRateLimiter, rateLimitHeaders, } from "../../middleware/rate-limit";
import { safeJsonParse, safeJsonStringify, } from "../../utils/safe-json";
import { HttpStatus, type HttpStatusCode, jsonError, jsonResponse, } from "../http-utils";

/** Signature header carrying the hex HMAC-SHA256 over the raw body. */
export const WEBHOOK_SIGNATURE_HEADER = "x-loop-lore-signature";

/** Default per-adapter delivery budget (spec §10 default-deny hardening). */
export const DEFAULT_WEBHOOK_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: 30,
};

/** TypeBox schema for the webhook payload (spec §3 webhook row). */
export const WebhookPayloadSchema = t.Object({
  id: t.Optional(t.String({ minLength: 1, },),),
  author: t.String({ minLength: 1, },),
  target: t.String({ minLength: 1, },),
  body: t.String(),
  timestamp: t.Optional(t.Number({ minimum: 0, },),),
},);

/** Normalized webhook payload shape. */
export interface WebhookPayload {
  id?: string;
  author: string;
  target: string;
  body: string;
  timestamp?: number;
}

/** Typed failure kinds of the ingestion path (bridge Result convention). */
export type WebhookIngestError =
  | { ok: false; code: "not_configured"; message: string }
  | { ok: false; code: "unknown_adapter"; message: string }
  | { ok: false; code: "rate_limited"; message: string; retryAfterSec: number }
  | { ok: false; code: "invalid_signature"; message: string }
  | { ok: false; code: "invalid_payload"; message: string };

/** Result of {@link ingestWebhook}: dispatched flag or typed failure. */
export type WebhookIngestResult = { ok: true; dispatched: boolean } | WebhookIngestError;

/** Surface-specific seams; the rest arrives via RegisterPluginsOpts. */
export interface IntegrationsSurfaceOpts {
  /** App-wired bridge; absent until the integrations bootstrap lands. */
  bridge?: MessageBridge;
  /** Per-adapter secret: raw value or `secret:` reference. */
  adapterSecrets?: Record<string, string>;
  /** Per-adapter window override; default 30 requests / 60s. */
  rateLimit?: RateLimitConfig;
  /** Injection seam (tests/shutdown): replaces the internally built limiter. */
  limiter?: RateLimiter;
}

/** Dependencies for {@link ingestWebhook}. */
export interface WebhookIngestDeps {
  bridge?: MessageBridge;
  adapterSecrets: Record<string, string>;
  limiter: RateLimiter;
}

/** Normalize a validated payload into the bridge envelope. Foreign inbound
 * messages without a protocol id get a synthetic one (AdapterMessage.id is
 * mandatory; bridge dedup keys on it).
 * @param payload Validated webhook payload.
 * @returns The bridge envelope.
 */
function toAdapterMessage(payload: WebhookPayload,): AdapterMessage {
  return {
    id: payload.id ?? crypto.randomUUID(),
    author: payload.author,
    target: payload.target,
    body: payload.body,
    timestamp: payload.timestamp ?? Date.now(),
  };
}

/**
 * Constant-time hex digest comparison ("sha256=" scheme prefix tolerated).
 * @param expectedHex Computed HMAC hex digest.
 * @param provided Signature header value.
 * @returns True when the digests match in constant time.
 */
function signaturesMatch(expectedHex: string, provided: string,): boolean {
  const prefixed = provided.trim();
  const providedHex = prefixed.startsWith("sha256=",)
    ? prefixed.slice("sha256=".length,)
    : prefixed;

  const a = Buffer.from(expectedHex, "utf8",);
  const b = Buffer.from(providedHex, "utf8",);
  return a.length === b.length && timingSafeEqual(a, b,);
}

/**
 * Ingest one webhook delivery: per-adapter rate limit, default-deny HMAC
 * gate over the RAW bytes, payload validation, bridge hand-off. The payload
 * is never parsed or processed before the signature verifies.
 * @param request deps + adapter + rawBody + signature.
 * @param request.deps Injected bridge, per-adapter secrets, and limiter.
 * @param request.adapter Adapter name from the URL path.
 * @param request.rawBody Raw request body, exactly as received.
 * @param request.signature Signature header value (may be absent).
 * @returns Typed result — never throws; an unopenable `secret:` reference is
 * collapsed into invalid_signature so envelope internals never leak.
 */
export async function ingestWebhook(
  { deps, adapter, rawBody, signature, }: {
    deps: WebhookIngestDeps;
    adapter: string;
    rawBody: string;
    signature: string | undefined;
  },
): Promise<WebhookIngestResult> {
  const secretRef = deps.adapterSecrets[adapter];
  if (secretRef === undefined) {
    return { ok: false, code: "unknown_adapter", message: `Unknown adapter: ${adapter}`, };
  }

  const budget = deps.limiter.consume(`webhook:${adapter}`,);
  if (!budget.allowed) {
    return {
      ok: false,
      code: "rate_limited",
      message: "Too many webhook deliveries for this adapter",
      retryAfterSec: budget.resetSec,
    };
  }

  if (signature === undefined || signature.trim() === "") {
    return { ok: false, code: "invalid_signature", message: "Missing signature", };
  }

  let secret: string;
  try {
    secret = await resolveCredential(secretRef,);
  } catch {
    return { ok: false, code: "invalid_signature", message: "Invalid signature", };
  }

  const expected = createHmac("sha256", secret,).update(rawBody, "utf8",).digest("hex",);
  if (!signaturesMatch(expected, signature,)) {
    return { ok: false, code: "invalid_signature", message: "Invalid signature", };
  }

  const parsedResult = safeJsonParse<unknown>(rawBody,);
  if (!parsedResult.ok) {
    return { ok: false, code: "invalid_payload", message: "Body is not valid JSON", };
  }

  const parsed = parsedResult.value;

  if (!Value.Check(WebhookPayloadSchema, parsed,)) {
    return { ok: false, code: "invalid_payload", message: "Webhook payload failed validation", };
  }

  if (deps.bridge === undefined) {
    return {
      ok: false,
      code: "not_configured",
      message: "Integrations bridge is not configured",
    };
  }

  const dispatched = deps.bridge.receive(adapter, toAdapterMessage(parsed,),);
  return { ok: true, dispatched, };
}

/**
 * Map a typed ingest failure onto the shared v1 error envelope.
 * @param result Typed ingest failure.
 * @returns The HTTP error response.
 */
function toErrorResponse(result: WebhookIngestError,): Response {
  switch (result.code) {
    case "not_configured":
      return jsonError(result.message, HttpStatus.ServiceUnavailable,);
    case "unknown_adapter":
      return jsonError(result.message, HttpStatus.NotFound,);
    case "rate_limited": {
      const body = safeJsonStringify({ error: result.message, meta: { api_version: "1", }, },);
      return new Response(body.ok ? body.value : "{}", {
        status: HttpStatus.TooManyRequests,
        headers: rateLimitHeaders(
          { allowed: false, limit: 0, remaining: 0, resetSec: result.retryAfterSec, },
          result.retryAfterSec,
        ),
      },);
    }

    case "invalid_signature":
      return jsonError(result.message, HttpStatus.Unauthorized,);
    case "invalid_payload":
      return jsonError(result.message, HttpStatus.UnprocessableEntity,);
  }
}

/**
 * @param opts RegisterPluginsOpts (unused today; the seams below carry the
 *   ingestion dependencies until the integrations bootstrap wires config).
 * @param _opts
 * @param seams Integrations-specific DI: bridge, per-adapter secrets, limiter.
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { integrations: { webhooks: { [adapter: string]: { post: { ...; }; }; }; }; }; }, { ...; }, { ...; }>}
 */
export function integrationsSurface(
  _opts: RegisterPluginsOpts,
  seams: IntegrationsSurfaceOpts = {},
) {
  const deps: WebhookIngestDeps = {
    bridge: seams.bridge,
    adapterSecrets: seams.adapterSecrets ?? {},
    limiter: seams.limiter ?? createRateLimiter(seams.rateLimit ?? DEFAULT_WEBHOOK_RATE_LIMIT,),
  };

  return new Elysia({ name: "v1-integrations", },)
    .post(
      "/api/v1/integrations/webhooks/:adapter",
      async ({ request, params, headers, },) => {
        // RAW bytes first: the HMAC is computed over exactly what was sent,
        // never over a re-serialized parse of the body.
        const rawBody = await request.text();
        const result = await ingestWebhook(
          { deps, adapter: params.adapter, rawBody, signature: headers[WEBHOOK_SIGNATURE_HEADER], },
        );

        if (!result.ok) { return toErrorResponse(result,); }
        return jsonResponse(
          { ok: true, dispatched: result.dispatched, },
          // 202 Accepted — HttpStatus has no Accepted member yet (only
          // 200/201/204), so the numeric literal is pinned explicitly.
          202 as HttpStatusCode,
        );
      },
      {
        params: t.Object({ adapter: t.String({ minLength: 1, },), },),
        headers: t.Object({ "x-loop-lore-signature": t.Optional(t.String(),), },),
      },
    );
}
