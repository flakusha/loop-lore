// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Pre-generation seam tests (WI-5).
 *
 * Verdict → message-level effects over a real test DB: soft-refuse
 * consumes the beat (status rejected — the shipped skip interlock then
 * refuses a skip of the same beat), hard-block writes the OOC system
 * notice (content_type system) and reports blocked, annotate returns the
 * hint, allow returns nothing. gate.verdict event emission is asserted
 * with injected handlers.
 */
import { beforeAll, describe, expect, test, } from "bun:test";
import { type Kysely, sql, } from "kysely";

import { MessageContentType, MessageStatus, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import type { EventHandlerDefinition, } from "../plugins/types";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  insertActors,
  insertCharacterStats,
  insertChats,
  insertMessages,
  insertUsers,
} from "../test-utils/insert-helpers";
import { runImmersionGatePrecheck, } from "./pregeneration";
import { DEFAULT_IMMERSION_CONFIG, GateRuleId, GateSeverity, } from "./types";

let db: Kysely<DB>;
let chatId: string;
let actorId: string;

/** Gate config surfacing movement rule as each severity under test. */
function configWithMovement(severity: GateSeverity,): typeof DEFAULT_IMMERSION_CONFIG {
  return {
    ...DEFAULT_IMMERSION_CONFIG,
    rules: {
      ...DEFAULT_IMMERSION_CONFIG.rules,
      [GateRuleId.MovementWhileRestrained]: { enabled: true, severity, },
    },
  };
}

/** Capture gate.verdict emissions. */
function captureHandlers(): {
  handlers: EventHandlerDefinition[];
  events: Array<{ event: string; data: unknown }>;
} {
  const events: Array<{ event: string; data: unknown }> = [];
  const handlers: EventHandlerDefinition[] = [{
    event: "gate.verdict",
    handler: async (data,) => {
      events.push({ event: "gate.verdict", data, },);
    },
  },];

  return { handlers, events, };
}

beforeAll(async () => {
  createLogger({ level: "error", },);
  ({ db, } = await createTestDb());
  await insertUsers(db, "pregate-user", "Precheck User",);
  const ownerId = await db.selectFrom("users",).select("id",).where("username", "=", "pregate-user",)
    .executeTakeFirst();

  chatId = await insertChats(db, "pregate-chat", ownerId!.id,);
  actorId = await insertActors(db, "Precheck Actor",);
  await insertCharacterStats(db, actorId, 100, 100, 10, {
    conditions: JSON.stringify(["bound", "webbed to the wall",],),
  },);
},);

describe("runImmersionGatePrecheck", () => {
  test("soft-refuse consumes the beat and returns narration framing", async () => {
    const beatId = await insertMessages(db, chatId, actorId, "user", "I sprint away from the ropes", {
      status: MessageStatus.Confirmed,
    },);

    const { handlers, events, } = captureHandlers();

    const result = await runImmersionGatePrecheck({
      db,
      config: configWithMovement(GateSeverity.SoftRefuse,),
      chatId,
      actorId,
      actorName: "Kara",
      worldId: null,
      content: "I sprint away from the ropes",
      parentMessageId: beatId,
      eventHandlers: handlers,
    },);

    expect(result.action,).toBe("continue",);
    expect(result.beatConsumed,).toBe(true,);
    expect(result.promptInjection,).toContain("I sprint",);
    expect(result.promptInjection,).toContain("does not succeed",);

    const beat = await db.selectFrom("messages",).select("status",).where("id", "=", beatId,).executeTakeFirst();
    expect(beat?.status,).toBe(MessageStatus.Rejected,);
    expect(events,).toHaveLength(1,);
  });

  test("hard-block writes the OOC system notice and reports blocked", async () => {
    const beatId = await insertMessages(db, chatId, actorId, "user", "I sprint away from the ropes", {
      status: MessageStatus.Confirmed,
    },);

    const result = await runImmersionGatePrecheck({
      db,
      config: configWithMovement(GateSeverity.HardBlock,),
      chatId,
      actorId,
      actorName: "Kara",
      worldId: null,
      content: "I sprint away from the ropes",
      parentMessageId: beatId,
      eventHandlers: [],
    },);

    expect(result.action,).toBe("blocked",);

    // The beat is NOT rejected — the skip escape hatch must stay available.
    const beat = await db.selectFrom("messages",).select("status",).where("id", "=", beatId,).executeTakeFirst();
    expect(beat?.status,).toBe(MessageStatus.Confirmed,);

    const notice = await db
      .selectFrom("messages",)
      .select(["content", "content_type", "role", "metadata",],)
      .where("chat_id", "=", chatId,)
      .where("content_type", "=", MessageContentType.System,)
      .orderBy(sql`rowid`, "desc",)
      .limit(1,)
      .executeTakeFirst();

    expect(notice?.role,).toBe("system",);
    expect(notice?.content,).toContain("[OOC]",);
    expect(notice?.content,).toContain("turn skip",);
    expect(notice?.metadata,).toContain("skipOffered",);
  });

  test("annotate returns the hint without touching the beat", async () => {
    const beatId = await insertMessages(db, chatId, actorId, "user", "I sprint away from the ropes", {
      status: MessageStatus.Confirmed,
    },);

    const result = await runImmersionGatePrecheck({
      db,
      config: configWithMovement(GateSeverity.Annotate,),
      chatId,
      actorId,
      actorName: "Kara",
      worldId: null,
      content: "I sprint away from the ropes",
      parentMessageId: beatId,
      eventHandlers: [],
    },);

    expect(result.action,).toBe("continue",);
    expect(result.promptInjection,).toContain("Consistency note",);
    expect(result.beatConsumed,).toBeUndefined();
    const beat = await db.selectFrom("messages",).select("status",).where("id", "=", beatId,).executeTakeFirst();
    expect(beat?.status,).toBe(MessageStatus.Confirmed,);
  });

  test("allow and empty content do nothing", async () => {
    const untouched = await runImmersionGatePrecheck({
      db,
      chatId,
      actorId,
      actorName: "Kara",
      worldId: null,
      content: "I hum a quiet tune",
      parentMessageId: null,
      eventHandlers: [],
    },);

    expect(untouched,).toEqual({ action: "continue", },);

    const empty = await runImmersionGatePrecheck({
      db,
      chatId,
      actorId,
      actorName: "Kara",
      worldId: null,
      content: undefined,
      parentMessageId: null,
      eventHandlers: [],
    },);

    expect(empty,).toEqual({ action: "continue", },);
  });
});
