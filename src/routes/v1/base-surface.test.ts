// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Production MFA delivery wiring: the v1 surface must thread a real bridge
 * through authProtectedRoutes -> challengeRoute instead of leaving it
 * undefined (which made every issue return 503).
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { RegisterPluginsOpts, } from "../../app/register-plugins";
import { verifyChallenge, } from "../../auth/factors/challenge";
import type { Config, } from "../../config/schema";
import { ChallengePurpose, FactorKind, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createMessageBridge, } from "../../integrations/bridge";
import { createEmailAdapter, type EmailTransportMessage, } from "../../integrations/email/adapter";
import { createBridgeRegistry, } from "../../integrations/registry";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { insertAuthFactors, insertUsers, } from "../../test-utils/insert-helpers";
import { baseSurface, createMfaBridge, } from "./base-surface";

const T0 = 1_700_000_000_000;
const TARGET = "user@example.com";

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

/** Minimal config with email enabled. */
function configuredConfig(): Config {
  return {
    integrations: {
      enabled: true,
      email: {
        enabled: true,
        smtpHost: "smtp.example.com",
        smtpPort: 587,
        smtpUser: "bot@example.com",
        smtpPass: "",
        imapHost: "",
        imapPort: 993,
        imapUser: "",
        imapPass: "",
        pgpEnabled: false,
      },
    },
  } as unknown as Config;
}

/** A bridge with a capture transport for the mounted-path delivery probe. */
function captureBridge(sent: EmailTransportMessage[],) {
  const adapter = createEmailAdapter({
    transport: {
      send: async (message,) => {
        sent.push(message,);
        return "<mfa@test.example>";
      },
    },
  },);

  // connect() has no awaits in its body; the flags are set synchronously.
  void adapter.connect({ smtpUser: "bot@example.com", },);
  const registry = createBridgeRegistry();
  registry.register(adapter,);
  return createMessageBridge(registry,);
}

describe("createMfaBridge", () => {
  test("unconfigured email fails closed with no bridge", () => {
    expect(createMfaBridge({ integrations: { enabled: false, }, } as unknown as Config,),).toBeUndefined();
    expect(createMfaBridge({ integrations: { enabled: true, email: { enabled: false, }, }, } as unknown as Config,),)
      .toBeUndefined();
  });

  test("configured email registers a target-owning adapter and delivers", async () => {
    const sent: EmailTransportMessage[] = [];
    const bridge = createMfaBridge(configuredConfig(), {
      send: async (message,) => {
        sent.push(message,);
        return "<mfa@test.example>";
      },
    },);

    expect(bridge,).toBeDefined();
    if (bridge === undefined) { throw new Error("bridge missing",); }

    const delivered = await bridge.send(TARGET, {
      id: "mfa-probe",
      author: "bot@example.com",
      target: TARGET,
      body: "code",
      timestamp: T0,
    },);

    expect(delivered.ok,).toBe(true,);
    expect(sent,).toHaveLength(1,);
  });
});

describe("production v1 surface", () => {
  test("mounted challenge path issues, delivers and verifies (not 503)", async () => {
    const userId = await insertUsers(db, "mfa-user", "MFA User",);
    const factorId = await insertAuthFactors(db, userId, FactorKind.Email, T0, {
      target: TARGET,
      verified_at: T0,
    },);

    const sent: EmailTransportMessage[] = [];
    const app = new Elysia()
      .derive(() => ({ userId, sessionId: `sess-${userId}`, userRole: "user", }))
      .use(baseSurface({
        database: db,
        config: configuredConfig(),
        bridge: captureBridge(sent,),
      } as unknown as RegisterPluginsOpts,),);

    const res = await app.handle(
      new Request("http://localhost/api/v1/auth/factors/challenge", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ factorId, channel: "email", destination: TARGET, purpose: "login", },),
      },),
    );

    expect(res.status,).toBe(200,);
    expect(sent,).toHaveLength(1,);

    const body = await res.json() as { challengeId: string };
    const code = /code is: (\S+)/.exec(sent[0]?.body ?? "",)?.[1] ?? "";
    const verified = await verifyChallenge({
      database: db,
      challengeId: body.challengeId,
      userId,
      code,
      purpose: ChallengePurpose.Login,
      now: () => T0,
    },);

    expect(verified.ok,).toBe(true,);
  });
});
