// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Send choke point — direct send and forward share one NSFW/consent verdict.
 *
 * Explicit denial returns the stable reason code Web/TUI already classify on;
 * verdict infrastructure failure fails open and leaves an audit row.
 *
 * Resource contract: each test owns a fresh in-memory DB with unique ids
 * (beforeEach/destroyTestDb); no shared fetch stub; the age-gate singleton is
 * reset to disabled around the file.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import { sql, } from "kysely";
import { initAgeGate, } from "../../../age-gate/controller";
import type { Config, } from "../../../config/schema";
import { createConfigSchema, } from "../../../config/schema-class";
import { AgeGateMode, MessageRole, } from "../../../db/enums";
import { createLogger, } from "../../../logger";
import { recordNsfwConsent, } from "../../../middleware/nsfw-gate/consent-ledger";
import { createTestDb, destroyTestDb, type TestDb, } from "../../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertMessages,
  insertUsers,
} from "../../../test-utils/insert-helpers";
import { failureReason, } from "../../../tui/chat/api";
import { uid, } from "../../../utils";
import { createRoutes, } from "../create";
import { forwardRoutes, } from "../forward";
import { enforceNsfwConsentGate, } from "../guards";

const BASE = "http://localhost";

let fixture: TestDb;
let config: Config;
let userId: string;
let chatId: string;
let sourceChatId: string;
let sourceMessageId: string;

/** Stable code is the verdict reason, on the wire in `data.reason` and `error`. */
function assertDenied(body: { code?: string; data?: { reason?: string }; error?: string },): void {
  expect(body.code,).toBe("consent_required",);
  expect(body.error,).toBe("NSFW access denied: consent_required",);
  // `data` survives on routes without an ErrorResponse schema; Elysia cleans
  // it from the send route, so `code` is the cross-surface carrier.
}

/** Audit rows carry the verdict code in `meta`, never the raw identifiers. */
async function auditRows(eventType: string,) {
  return fixture.db
    .selectFrom("log_entries",)
    .selectAll()
    .where("event_type", "=", eventType,)
    .execute();
}

function sendApp(): Elysia {
  return new Elysia({ name: "test-consent-send", },)
    .derive(() => ({ userId, userRole: "user", }))
    .use(createRoutes({ database: fixture.db, config, }, "/api",),) as unknown as Elysia;
}

function forwardApp(): Elysia {
  return new Elysia({ name: "test-consent-forward", },)
    .derive(() => ({ userId, userRole: "user", }))
    .use(forwardRoutes({ database: fixture.db, config, }, "/api",),) as unknown as Elysia;
}

function sendRequest(): Request {
  return new Request(`${BASE}/api/chats/${chatId}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", },
    body: JSON.stringify({ content: "hello there", },),
  },);
}

function forwardRequest(): Request {
  return new Request(`${BASE}/api/chats/${sourceChatId}/messages/${sourceMessageId}/forward`, {
    method: "POST",
    headers: { "content-type": "application/json", },
    body: JSON.stringify({ targetChatId: chatId, },),
  },);
}

describe("NSFW consent verdict on send and forward", () => {
  beforeAll(() => {
    createLogger({ level: "error", },);
    initAgeGate({ enabled: false, minimumAge: 18, mode: AgeGateMode.None, },);
  },);

  beforeEach(async () => {
    fixture = await createTestDb();
    config = createConfigSchema().defaults as Config;
    config.nsfw.allowNsfw = true;
    config.nsfw.consentRequired = true;

    userId = uid();
    chatId = uid();
    sourceChatId = uid();
    sourceMessageId = uid();

    await insertUsers(fixture.db, "sender", "Sender", {
      id: userId,
      birth_date: "1990-01-01",
      age_gate_accepted_at: "2024-01-01T00:00:00.000Z",
    },);

    await insertActors(fixture.db, "Sender", {
      id: userId,
      actor_type: "user",
      user_id: userId,
      owner_id: userId,
      content_rating: "nsfw_mild",
      settings: "{}",
      row_version: 0,
    } as never,);

    for (const id of [chatId, sourceChatId,]) {
      await insertChats(fixture.db, `Chat ${id}`, userId, { id, } as never,);
      await insertChatParticipants(fixture.db, id, userId, {} as never,);
    }

    await insertMessages(fixture.db, sourceChatId, userId, MessageRole.User, "source text", {
      id: sourceMessageId,
    },);
  },);

  afterEach(async () => {
    await destroyTestDb(fixture,);
  },);

  afterAll(() => {
    initAgeGate({ enabled: false, minimumAge: 18, mode: AgeGateMode.None, },);
  },);

  test("missing consent blocks a direct send with the stable code", async () => {
    const res = await sendApp().handle(sendRequest(),);
    expect(res.status,).toBe(403,);
    assertDenied(
      await res.json() as { code?: string; error?: string; data?: { reason?: string } },
    );

    const messages = await fixture.db
      .selectFrom("messages",)
      .select("id",)
      .where("chat_id", "=", chatId,)
      .execute();

    expect(messages,).toHaveLength(0,); // denial lands before any insert

    const audit = await auditRows("nsfw.gate.blocked",);
    expect(audit,).toHaveLength(1,);
    expect(audit[0]!.meta,).toContain("consent_required",);
    expect(audit[0]!.user_id,).not.toBe(userId,); // hashed, never the raw id
  });

  test("missing consent blocks a forwarded send with the same code", async () => {
    const res = await forwardApp().handle(forwardRequest(),);
    expect(res.status,).toBe(403,);
    assertDenied(
      await res.json() as { code?: string; error?: string; data?: { reason?: string } },
    );

    const forwarded = await fixture.db
      .selectFrom("messages",)
      .select("id",)
      .where("chat_id", "=", chatId,)
      .execute();

    expect(forwarded,).toHaveLength(0,);
    expect(await auditRows("nsfw.gate.blocked",),).toHaveLength(1,);
  });

  test("verdict infrastructure failure allows the send and audits the verdict", async () => {
    await sql`DROP TABLE nsfw_consent_state`.execute(fixture.db,);

    const res = await sendApp().handle(sendRequest(),);
    expect(res.status,).toBe(201,);

    const messages = await fixture.db
      .selectFrom("messages",)
      .select(["id", "role",],)
      .where("chat_id", "=", chatId,)
      .execute();

    expect(messages.filter((row,) => row.role === MessageRole.User),).toHaveLength(1,);

    const audit = await auditRows("nsfw.gate.allowed",);
    expect(audit,).toHaveLength(1,);
    expect(audit[0]!.meta,).toContain("verdict_unavailable",);
  });

  test("verdict infrastructure failure allows a forward and audits the verdict", async () => {
    await sql`DROP TABLE nsfw_consent_state`.execute(fixture.db,);

    const res = await forwardApp().handle(forwardRequest(),);
    expect(res.status,).toBe(201,);
    expect((await res.json() as { id: string }).id,).toBeString();

    const audit = await auditRows("nsfw.gate.allowed",);
    expect(audit,).toHaveLength(1,);
    expect(audit[0]!.meta,).toContain("verdict_unavailable",);
  });

  test("granted consent allows the send and audits the allowed verdict", async () => {
    await recordNsfwConsent({
      database: fixture.db,
      chatId,
      userId,
      action: "given",
      reason: "test grant",
    },);

    const res = await sendApp().handle(sendRequest(),);
    expect(res.status,).toBe(201,);

    const audit = await auditRows("nsfw.gate.allowed",);
    expect(audit,).toHaveLength(1,);
    expect(audit[0]!.meta,).toContain("verdict_allowed",);
  });

  test("shared consent choke point denies directly with the stable code", async () => {
    const denial = await enforceNsfwConsentGate({
      database: fixture.db,
      config,
      userId,
      chatId,
      actorId: userId,
      surface: "send",
    },);

    expect(denial,).not.toBeNull();
    expect(denial!.status,).toBe(403,);
    assertDenied(await denial!.json() as { code?: string; error?: string },);
    expect(await auditRows("nsfw.gate.blocked",),).toHaveLength(1,);
  });

  test("TUI reads the stable code from any 403 body carrier", () => {
    const envelope = {
      error: "NSFW access denied: consent_required",
      code: "consent_required",
      data: { reason: "consent_required", },
    };

    expect(failureReason(envelope as never,),).toBe("consent_required",);
    expect(failureReason({ error: "NSFW access denied: consent_revoked", } as never,),)
      .toBe("consent_revoked",);
  });
});
