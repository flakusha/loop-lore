// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route-level test for the webhook ingestion surface wired to the REAL
 * MessageBridge (not a stub). A handler failure must not burn the inbound
 * id: the provider's redelivery of the same message id has to dispatch
 * again, otherwise the message is lost forever.
 *
 * See the dedup rollback in src/integrations/bridge.ts::receive.
 */

import { afterEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import { createHmac, } from "node:crypto";
import type { RegisterPluginsOpts, } from "../../app/register-plugins";
import { createBridgeRegistry, createMessageBridge, } from "../../integrations";
import { createRateLimiter, } from "../../middleware/rate-limit";
import {
  integrationsSurface,
  WEBHOOK_SIGNATURE_HEADER,
} from "./integrations-surface";

const ADAPTER = "slack";
const SECRET = "dedup-rollback-secret";

const BODY = JSON.stringify({
  id: "proto-dedup-1",
  author: "user-1",
  target: "room-1",
  body: "hello from the webhook",
  timestamp: 1_700_000_000_000,
},);

/** The surface takes RegisterPluginsOpts for convention; it uses none of it. */
const registerOpts = {} as RegisterPluginsOpts;

/** Limiters created per test; destroyed in afterEach. */
const createdLimiters: Array<{ destroy(): void }> = [];

/**
 * Hex HMAC-SHA256 over the raw body with the fixture secret.
 * @param body
 * @returns the hex digest
 */
function sign(body: string,): string {
  return createHmac("sha256", SECRET,).update(body, "utf8",).digest("hex",);
}

/**
 * POST one delivery through the surface app.
 * @param app
 * @param signature - the signature header value (defaults to a valid one)
 * @returns the raw response
 */
function post(
  app: { handle(request: Request,): Promise<Response> },
  signature = sign(BODY,),
): Promise<Response> {
  return app.handle(
    new Request(`http://localhost/api/v1/integrations/webhooks/${ADAPTER}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [WEBHOOK_SIGNATURE_HEADER]: signature,
      },
      body: BODY,
    },),
  );
}

describe("integrations webhook surface - real bridge dedup", () => {
  afterEach(() => {
    for (const limiter of createdLimiters) { limiter.destroy(); }
    createdLimiters.length = 0;
  },);

  test("a redelivery after a handler failure dispatches again", async () => {
    let calls = 0;
    const bridge = createMessageBridge(createBridgeRegistry(),);
    bridge.onMessage(() => {
      calls++;
      throw new Error("handler blew up",);
    },);

    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 100, },);
    createdLimiters.push(limiter,);
    const app = new Elysia().use(
      integrationsSurface(registerOpts, { bridge, adapterSecrets: { [ADAPTER]: SECRET, }, limiter, },),
    );

    // First delivery: the handler throws, so the route answers 500.
    const first = await post(app,);
    expect(first.status,).toBe(500,);
    expect(calls,).toBe(1,);

    // Redelivery of the same protocol id: the dedup entry was rolled back,
    // so the message is dispatched (again) instead of being swallowed.
    const second = await post(app,);
    expect(second.status,).toBe(500,);
    expect(calls,).toBe(2,);
  });

  test("a duplicate delivery that dispatched fine is still deduped", async () => {
    let calls = 0;
    const bridge = createMessageBridge(createBridgeRegistry(),);
    bridge.onMessage(() => {
      calls++;
    },);

    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 100, },);
    createdLimiters.push(limiter,);
    const app = new Elysia().use(
      integrationsSurface(registerOpts, { bridge, adapterSecrets: { [ADAPTER]: SECRET, }, limiter, },),
    );

    const first = await post(app,);
    expect(first.status,).toBe(202,);
    const firstJson = (await first.json()) as { dispatched: boolean };
    expect(firstJson.dispatched,).toBe(true,);

    const second = await post(app,);
    expect(second.status,).toBe(202,);
    const secondJson = (await second.json()) as { dispatched: boolean };
    expect(secondJson.dispatched,).toBe(false,);
    expect(calls,).toBe(1,);
  });

  test("an unauthenticated delivery does not spend the verified delivery budget", async () => {
    let calls = 0;
    const bridge = createMessageBridge(createBridgeRegistry(),);
    bridge.onMessage(() => {
      calls++;
    },);

    // A single delivery fits the budget: only a junk POST that consumed it
    // could starve the legitimate delivery below.
    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 1, },);
    createdLimiters.push(limiter,);
    const app = new Elysia().use(
      integrationsSurface(registerOpts, { bridge, adapterSecrets: { [ADAPTER]: SECRET, }, limiter, },),
    );

    const junk = await post(app, "not-the-signature",);
    expect(junk.status,).toBe(401,);

    const delivery = await post(app,);
    expect(delivery.status,).toBe(202,);
    const json = (await delivery.json()) as { dispatched: boolean };
    expect(json.dispatched,).toBe(true,);
    expect(calls,).toBe(1,);
  });
});
