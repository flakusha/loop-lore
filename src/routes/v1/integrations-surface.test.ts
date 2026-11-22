// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Fixture tests for the inbound webhook ingestion surface. Real HMACs are
 * computed in-test; no network, no real secrets.
 */

import { afterAll, afterEach, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { createHmac, } from "node:crypto";
import type { RegisterPluginsOpts, } from "../../app/register-plugins";
import { flushActiveStore, } from "../../async/store-registry";
import { loadConfig, } from "../../config/load";
import type { DB, } from "../../db/schema";
import { createApp, } from "../../elysia-app";
import type { AdapterMessage, MessageBridge, } from "../../integrations";
import { createRateLimiter, } from "../../middleware/rate-limit";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  ingestWebhook,
  integrationsSurface,
  type IntegrationsSurfaceOpts,
  WEBHOOK_SIGNATURE_HEADER,
  type WebhookIngestDeps,
} from "./integrations-surface";

const ADAPTER = "slack";
const SECRET = "fixture-webhook-secret";

/** Recorded bridge receives for assertions. */
interface ReceivedCall {
  adapter: string;
  message: AdapterMessage;
}

/** Build a recording MessageBridge stub (all seams, no real routing). */
function recordingBridge(calls: ReceivedCall[], dispatched = true,): MessageBridge {
  return {
    async send(_target, message,) {
      return { ok: true, adapter: ADAPTER, id: message.id, idempotencyKey: "k", };
    },
    onMessage(_handler,): void {},
    receive(adapter, message,) {
      calls.push({ adapter, message, },);
      return dispatched;
    },
  };
}

/** Hex HMAC-SHA256 over the raw body with the fixture secret. */
function sign(body: string, secret = SECRET,): string {
  return createHmac("sha256", secret,).update(body, "utf8",).digest("hex",);
}

const VALID_BODY = JSON.stringify({
  id: "proto-1",
  author: "user-1",
  target: "room-1",
  body: "hello from the webhook",
  timestamp: 1_700_000_000_000,
},);

/** POST a delivery through the surface app and return the Response. */
async function post(
  app: { handle(request: Request,): Promise<Response> },
  adapter: string,
  body: string,
  signature?: string,
): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json", };
  if (signature !== undefined) { headers[WEBHOOK_SIGNATURE_HEADER] = signature; }
  return await app.handle(
    new Request(`http://localhost/api/v1/integrations/webhooks/${adapter}`, {
      method: "POST",
      headers,
      body,
    },),
  );
}

/** Limiters created by buildApp; destroyed in afterEach. */
const createdLimiters: Array<{ destroy(): void }> = [];

/** The surface takes RegisterPluginsOpts for convention; it uses none of it. */
const registerOpts = {} as RegisterPluginsOpts;

function buildApp(
  calls: ReceivedCall[],
  surfaceOpts: IntegrationsSurfaceOpts = {},
  dispatched = true,
) {
  const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 100, },);
  createdLimiters.push(limiter,);
  return new Elysia().use(
    integrationsSurface(registerOpts, {
      bridge: recordingBridge(calls, dispatched,),
      adapterSecrets: { [ADAPTER]: SECRET, },
      limiter,
      ...surfaceOpts,
    },),
  );
}

describe("integrations webhook surface", () => {
  afterEach(() => {
    for (const limiter of createdLimiters) { limiter.destroy(); }
    createdLimiters.length = 0;
  },);

  test("valid signature returns 202 and hands a normalized AdapterMessage to the bridge", async () => {
    const calls: ReceivedCall[] = [];
    const res = await post(buildApp(calls,), ADAPTER, VALID_BODY, sign(VALID_BODY,),);
    expect(res.status,).toBe(202,);
    const json = (await res.json()) as { ok: boolean; dispatched: boolean };
    expect(json.ok,).toBe(true,);
    expect(json.dispatched,).toBe(true,);
    expect(calls,).toHaveLength(1,);
    expect(calls[0]!.adapter,).toBe(ADAPTER,);
    expect(calls[0]!.message,).toEqual({
      id: "proto-1",
      author: "user-1",
      target: "room-1",
      body: "hello from the webhook",
      timestamp: 1_700_000_000_000,
    },);
  });

  test("bad signature returns 401 and the bridge is NOT called", async () => {
    const calls: ReceivedCall[] = [];
    const res = await post(
      buildApp(calls,),
      ADAPTER,
      VALID_BODY,
      sign(VALID_BODY, "wrong-secret",),
    );

    expect(res.status,).toBe(401,);
    const json = (await res.json()) as { error: string; code: string };
    expect(json.code,).toBe("UNAUTHORIZED",);
    expect(calls,).toHaveLength(0,);
  });

  test("missing signature header returns 401 and the bridge is NOT called", async () => {
    const calls: ReceivedCall[] = [];
    const res = await post(buildApp(calls,), ADAPTER, VALID_BODY,);
    expect(res.status,).toBe(401,);
    expect(calls,).toHaveLength(0,);
  });

  test("unknown adapter returns 404", async () => {
    const calls: ReceivedCall[] = [];
    const res = await post(buildApp(calls,), "unknown-adapter", VALID_BODY, sign(VALID_BODY,),);
    expect(res.status,).toBe(404,);
    const json = (await res.json()) as { code: string };
    expect(json.code,).toBe("NOT_FOUND",);
    expect(calls,).toHaveLength(0,);
  });

  test("invalid payload after a valid signature returns 422", async () => {
    const calls: ReceivedCall[] = [];
    const bad = JSON.stringify({ author: "", },);
    const res = await post(buildApp(calls,), ADAPTER, bad, sign(bad,),);
    expect(res.status,).toBe(422,);
    expect(calls,).toHaveLength(0,);
  });

  test("bridge not configured returns 503", async () => {
    const app = new Elysia().use(
      integrationsSurface(registerOpts, { adapterSecrets: { [ADAPTER]: SECRET, }, },),
    );

    const res = await post(app, ADAPTER, VALID_BODY, sign(VALID_BODY,),);
    expect(res.status,).toBe(503,);
  });

  test("duplicate delivery reports dispatched=false with 202", async () => {
    const calls: ReceivedCall[] = [];
    const res = await post(buildApp(calls, {}, false,), ADAPTER, VALID_BODY, sign(VALID_BODY,),);
    expect(res.status,).toBe(202,);
    const json = (await res.json()) as { dispatched: boolean };
    expect(json.dispatched,).toBe(false,);
  });

  test("rate limit trips per adapter with 429 + Retry-After", async () => {
    const calls: ReceivedCall[] = [];
    const app = buildApp(calls, { limiter: createRateLimiter({ windowMs: 60_000, maxRequests: 2, },), },);
    const first = await post(app, ADAPTER, VALID_BODY, sign(VALID_BODY,),);
    expect(first.status,).toBe(202,);
    const second = await post(app, ADAPTER, VALID_BODY, sign(VALID_BODY,),);
    expect(second.status,).toBe(202,);
    const third = await post(app, ADAPTER, VALID_BODY, sign(VALID_BODY,),);
    expect(third.status,).toBe(429,);
    expect(third.headers.get("Retry-After",),).not.toBeNull();
    expect(third.headers.get("X-RateLimit-Remaining",),).toBe("0",);
    expect(calls,).toHaveLength(2,);
  });

  test("unauthenticated junk POSTs do not consume the signed delivery budget", async () => {
    const calls: ReceivedCall[] = [];
    const app = buildApp(calls, { limiter: createRateLimiter({ windowMs: 60_000, maxRequests: 2, },), },);

    // Two junk deliveries: no signature header, then a wrong signature.
    expect((await post(app, ADAPTER, VALID_BODY,)).status,).toBe(401,);
    expect((await post(app, ADAPTER, VALID_BODY, "not-a-signature",)).status,).toBe(401,);

    // The legitimate delivery still gets through: the junk spent the
    // separate unauthenticated bucket, not the verified-delivery budget.
    const res = await post(app, ADAPTER, VALID_BODY, sign(VALID_BODY,),);
    expect(res.status,).toBe(202,);
    expect(calls,).toHaveLength(1,);
  });

  test("payload without id/timestamp gets synthetic id and current timestamp", async () => {
    const calls: ReceivedCall[] = [];
    const before = Date.now();
    const minimal = JSON.stringify({ author: "u", target: "r", body: "b", },);
    const res = await post(buildApp(calls,), ADAPTER, minimal, sign(minimal,),);
    expect(res.status,).toBe(202,);
    expect(calls,).toHaveLength(1,);
    const msg = calls[0]!.message;
    expect(msg.id,).toMatch(/[0-9a-f-]{36}/,);
    expect(msg.author,).toBe("u",);
    expect(msg.timestamp,).toBeGreaterThanOrEqual(before,);
  });

  test("ingestWebhook collapses an unopenable secret ref into invalid_signature", async () => {
    const deps: WebhookIngestDeps = {
      adapterSecrets: { [ADAPTER]: "secret:v1:not-base64:also-not", },
      limiter: {
        check: () => true,
        clear: () => {},
        consume: () => ({ allowed: true, limit: 1, remaining: 0, resetSec: 60, }),
        destroy: () => {},
        peek: () => ({ allowed: true, limit: 1, remaining: 0, resetSec: 60, }),
        record: () => {},
        refund: () => {},
        reset: () => {},
      },
    };

    const result = await ingestWebhook({ deps, adapter: ADAPTER, rawBody: VALID_BODY, signature: sign(VALID_BODY,), },);
    expect(result.ok,).toBe(false,);
    if (!result.ok) { expect(result.code,).toBe("invalid_signature",); }
  });

  test("prototype-chain magic keys on the adapter segment return unknown_adapter", async () => {
    const deps: WebhookIngestDeps = {
      adapterSecrets: { [ADAPTER]: SECRET, },
      limiter: {
        check: () => true,
        clear: () => {},
        consume: () => ({ allowed: true, limit: 1, remaining: 0, resetSec: 60, }),
        destroy: () => {},
        peek: () => ({ allowed: true, limit: 1, remaining: 0, resetSec: 60, }),
        record: () => {},
        refund: () => {},
        reset: () => {},
      },
    };

    // `__proto__`, `constructor`, and `toString` are inherited properties on
    // a plain object; the lookup must treat them as not found.
    for (const adapter of ["__proto__", "constructor", "toString",]) {
      const result = await ingestWebhook(
        { deps, adapter, rawBody: VALID_BODY, signature: sign(VALID_BODY,), },
      );

      expect(result.ok,).toBe(false,);
      if (!result.ok) { expect(result.code,).toBe("unknown_adapter",); }
    }
  });

  // The HMAC must be computed over the EXACT bytes that arrived, including
  // the degenerate and non-ASCII cases — the raw read is the whole point of
  // parse: "none" on this route.
  test("empty body: signature over the zero-byte payload verifies", async () => {
    const calls: ReceivedCall[] = [];
    const res = await post(buildApp(calls,), ADAPTER, "", sign("",),);
    // Empty body fails payload validation (422), NOT signature validation
    // (401): the signature matched the exact bytes that were sent.
    expect(res.status,).toBe(422,);
    expect(calls,).toHaveLength(0,);
  });

  test("unicode body: signature over the raw utf8 bytes verifies", async () => {
    const calls: ReceivedCall[] = [];
    const body = JSON.stringify({ id: "u1", author: "ünïcødé 🌍 你好", target: "r", body: "héllo 🚀", timestamp: 1, },);
    const res = await post(buildApp(calls,), ADAPTER, body, sign(body,),);
    expect(res.status,).toBe(202,);
    expect(calls,).toHaveLength(1,);
    expect(calls[0]!.message.body,).toBe("héllo 🚀",);
  });
});

/**
 * Regression tests for BUG-webhook-adapter-endpoint-500s-body-already-used-
 * under-compos. The surface is mounted through the REAL app composition
 * (createApp — the same barrel the ticket blames), where sibling JSON routes
 * force Elysia's body inference across the composed app. Without
 * parse: "none" on the webhook route, the handler's request.text() throws
 * "Body is already used" and the delivery 500s.
 */
describe("integrations webhook surface under the composed app", () => {
  let db: Kysely<DB>;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    ({ db, } = await createTestDb());
    const config = loadConfig();
    config.auth.required = false;
    app = createApp({
      database: db,
      config,
      handleNonApiRequest: async () => new Response("nf", { status: 404, },),
      handleApiRequest: async () => new Response("nf", { status: 404, },),
    },);
  },);

  afterAll(async () => {
    // Same teardown contract as error-boundary-ordering.test.ts: quiesce the
    // async-store queue BEFORE closing the DB handle; never app.stop().
    await flushActiveStore();
    await db.destroy();
  },);

  test("a POST with a pre-parsed body never 500s on 'Body is already used'", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/v1/integrations/webhooks/slack", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [WEBHOOK_SIGNATURE_HEADER]: sign(VALID_BODY,),
        },
        body: VALID_BODY,
      },),
    );

    // The composed app has no bridge/secrets wired (production bootstrap has
    // not yet), so the ingest result is unknown_adapter → 404. The regression
    // is the 500: before parse: "none", the raw read threw before the adapter
    // lookup and every composed delivery died with "Body is already used".
    expect(res.status,).toBe(404,);
    const json = (await res.json()) as { code: string };
    expect(json.code,).toBe("NOT_FOUND",);
  });
});
