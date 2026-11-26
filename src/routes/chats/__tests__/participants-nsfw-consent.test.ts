// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Participant-add uses the same verdict as send: explicit denial fails closed
 * after ownership/actor resolution but before the membership write; verdict
 * infrastructure failure fails open and leaves an auditable verdict.
 *
 * Resource contract: each test owns a fresh in-memory DB with unique ids
 * (beforeEach/destroyTestDb); the age-gate singleton is reset to disabled
 * around the file.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import { sql, } from "kysely";
import { initAgeGate, } from "../../../age-gate/controller";
import type { Config, } from "../../../config/schema";
import { createConfigSchema, } from "../../../config/schema-class";
import { AgeGateMode, } from "../../../db/enums";
import { createLogger, } from "../../../logger";
import { createTestDb, destroyTestDb, type TestDb, } from "../../../test-utils/create-test-db";
import { insertActors, insertChats, insertUsers, } from "../../../test-utils/insert-helpers";
import { uid, } from "../../../utils";
import { participantRoutes, } from "../participants";

const BASE = "http://localhost";

let fixture: TestDb;
let config: Config;
let inviterId: string;
let invitedId: string;
let chatId: string;

function app(): Elysia {
  return new Elysia({ name: "test-consent-participants", },)
    .derive(() => ({ userId: inviterId, }))
    .use(participantRoutes({ database: fixture.db, config, }, "/api",),) as unknown as Elysia;
}

function addRequest(): Request {
  return new Request(`${BASE}/api/chats/${chatId}/participants`, {
    method: "POST",
    headers: { "content-type": "application/json", },
    body: JSON.stringify({ actorId: invitedId, },),
  },);
}

async function participants() {
  return fixture.db
    .selectFrom("chat_participants",)
    .select("actor_id",)
    .where("chat_id", "=", chatId,)
    .execute();
}

async function auditRows(eventType: string,) {
  return fixture.db
    .selectFrom("log_entries",)
    .selectAll()
    .where("event_type", "=", eventType,)
    .execute();
}

describe("participant-add NSFW consent verdict", () => {
  beforeAll(() => {
    createLogger({ level: "error", },);
    initAgeGate({ enabled: false, minimumAge: 18, mode: AgeGateMode.None, },);
  },);

  beforeEach(async () => {
    fixture = await createTestDb();
    config = createConfigSchema().defaults as Config;
    config.nsfw.allowNsfw = true;
    config.nsfw.consentRequired = true;

    inviterId = uid();
    invitedId = uid();
    chatId = uid();

    await insertUsers(fixture.db, "inviter", "Inviter", {
      id: inviterId,
      birth_date: "1990-01-01",
      age_gate_accepted_at: "2024-01-01T00:00:00.000Z",
    },);

    await insertActors(fixture.db, "Inviter", {
      id: inviterId,
      actor_type: "user",
      user_id: inviterId,
      owner_id: inviterId,
      settings: "{}",
      row_version: 0,
    } as never,);

    await insertActors(fixture.db, "Invited", {
      id: invitedId,
      actor_type: "character",
      owner_id: inviterId,
      content_rating: "nsfw_mild",
      settings: "{}",
      row_version: 0,
    } as never,);

    await insertChats(fixture.db, "NSFW Party", inviterId, {
      id: chatId,
      type: "group",
      mode: "group",
      nsfw_override: "enabled",
    } as never,);
  },);

  afterEach(async () => {
    await destroyTestDb(fixture,);
  },);

  afterAll(() => {
    initAgeGate({ enabled: false, minimumAge: 18, mode: AgeGateMode.None, },);
  },);

  test("missing consent blocks the add with the same stable code as send", async () => {
    const res = await app().handle(addRequest(),);
    expect(res.status,).toBe(403,);

    const body = await res.json() as { code?: string; error?: string; data?: { reason?: string } };
    expect(body.code,).toBe("consent_required",);
    expect(body.error,).toBe("NSFW access denied: consent_required",);
    expect(body.data?.reason,).toBe("consent_required",);

    expect(await participants(),).toHaveLength(0,);
    const audit = await auditRows("nsfw.gate.blocked",);
    expect(audit,).toHaveLength(1,);
    expect(audit[0]!.meta,).toContain("consent_required",);
    expect(audit[0]!.user_id,).not.toBe(inviterId,); // hashed, never the raw id
  });

  test("verdict infrastructure failure allows the add and audits the verdict", async () => {
    await sql`DROP TABLE nsfw_consent_state`.execute(fixture.db,);

    const res = await app().handle(addRequest(),);
    expect(res.status,).toBe(201,);
    expect((await participants()).map((row,) => row.actor_id),).toContain(invitedId,);

    const audit = await auditRows("nsfw.gate.allowed",);
    expect(audit,).toHaveLength(1,);
    expect(audit[0]!.meta,).toContain("verdict_unavailable",);
  });

  test("a chat with NSFW disabled skips the verdict", async () => {
    await fixture.db
      .updateTable("chats",)
      .set({ nsfw_override: "disabled", },)
      .where("id", "=", chatId,)
      .execute();

    const res = await app().handle(addRequest(),);
    expect(res.status,).toBe(201,);
    expect(await participants(),).toHaveLength(1,);
    expect(await auditRows("nsfw.gate.blocked",),).toHaveLength(0,);
    expect(await auditRows("nsfw.gate.allowed",),).toHaveLength(0,);
  });
});
