// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * MFA challenge route wiring tests (1.0.0 MFA code-channel-first).
 * Mounts challengeRoute with an injected session identity and a fake
 * email bridge: proves the split module keeps the public path and the
 * issue flow end to end. Parallel-safe: a fresh in-memory DB per test.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { verifyChallenge, } from "../../auth/factors/challenge";
import { ChallengePurpose, FactorKind, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createMessageBridge, } from "../../integrations/bridge";
import { createEmailAdapter, type EmailTransportMessage, } from "../../integrations/email/adapter";
import { createBridgeRegistry, } from "../../integrations/registry";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { insertAuthFactors, insertUsers, } from "../../test-utils/insert-helpers";
import { challengeRoute, } from "./challenge-routes";

const T0 = 1_700_000_000_000;

let fixture: TestDb | undefined;
let db: Kysely<DB>;

beforeEach(async () => {
  fixture = await createTestDb();
  db = fixture.db;
},);

afterEach(async () => {
  if (fixture) {
    await destroyTestDb(fixture,);
    fixture = undefined;
  }
},);

/** Build a connected bridge over a fake email transport capturing outbound mail. */
async function fakeEmailBridge(
  sent: EmailTransportMessage[],
): Promise<ReturnType<typeof createMessageBridge>> {
  const adapter = createEmailAdapter({
    transport: {
      send: async (message,) => {
        sent.push(message,);
        return "<mfa@test.example>";
      },
    },
  },);

  await adapter.connect({ smtpUser: "bot@loop.example", },);
  const registry = createBridgeRegistry();
  const registered = registry.register(adapter,);
  if (!registered.ok) { throw new Error("fake adapter registration failed",); }
  return createMessageBridge(registry,);
}

/** POST a challenge issue through the mounted route. */
function postIssue(app: Elysia, factorId: string,): Promise<Response> {
  return app.handle(
    new Request("http://localhost/api/auth/factors/challenge", {
      method: "POST",
      headers: { "content-type": "application/json", },
      body: JSON.stringify({
        factorId,
        channel: "email",
        destination: "user@example.com",
        purpose: "login",
      },),
    },),
  );
}

describe("challengeRoute", () => {
  test("mounted route issues over email — 200 carries id + expiry, code verifies", async () => {
    const userId = await insertUsers(db, "mfa-user", "MFA User",);
    const factorId = await insertAuthFactors(db, userId, FactorKind.Email, T0, {
      target: "user@example.com",
      verified_at: T0,
    },);

    const sent: EmailTransportMessage[] = [];
    const bridge = await fakeEmailBridge(sent,);
    const app = new Elysia()
      .derive(() => ({ userId, sessionId: `sess-${userId}`, userRole: "user", }))
      .use(challengeRoute({ database: db, bridge, }, "/api",),);

    const res = await postIssue(app as unknown as Elysia, factorId,);
    expect(res.status,).toBe(200,);

    const body = await res.json() as { challengeId: string; expiresAt: number };
    expect(typeof body.challengeId,).toBe("string",);
    expect(body.expiresAt,).toBeGreaterThan(Date.now(),);
    expect(sent,).toHaveLength(1,);

    const match = /code is: (\S+)/.exec(sent[0]?.body ?? "",);
    const verified = await verifyChallenge({
      database: db,
      challengeId: body.challengeId,
      userId,
      code: match?.[1] ?? "",
      purpose: ChallengePurpose.Login,
    },);

    expect(verified.ok,).toBe(true,);
  });

  test("mounted route without identity — 401 and no code sent", async () => {
    const userId = await insertUsers(db, "mfa-user", "MFA User",);
    const factorId = await insertAuthFactors(db, userId, FactorKind.Email, T0, {
      target: "user@example.com",
      verified_at: T0,
    },);

    const sent: EmailTransportMessage[] = [];
    const bridge = await fakeEmailBridge(sent,);
    const app = new Elysia().use(challengeRoute({ database: db, bridge, }, "/api",),);

    const res = await postIssue(app as unknown as Elysia, factorId,);
    expect(res.status,).toBe(401,);
    expect(sent,).toHaveLength(0,);
  });
});
