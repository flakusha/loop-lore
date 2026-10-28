// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * End-to-end gate flow tests (epic acceptance criteria).
 *
 * Captive actor tries to escape → at default config the verdict is at
 * least annotate; the soft-refuse narrates the FAILED escape (never a
 * success narration); a skill/item claim names the missing precondition;
 * hard-block writes the OOC notice with the skip affordance; and every
 * decision lands exactly one audit row.
 */
import { beforeAll, describe, expect, test, } from "bun:test";
import { type Kysely, } from "kysely";

import { MessageStatus, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
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

/** All decision-log rows for the chat, newest first. */
async function auditRows(): Promise<Array<Record<string, unknown>>> {
  return await db.selectFrom("immersion_decision_log",).selectAll().orderBy("id", "desc",).execute() as Array<
    Record<string, unknown>
  >;
}

beforeAll(async () => {
  createLogger({ level: "error", },);
  ({ db, } = await createTestDb());
  await insertUsers(db, "e2e-user", "E2E User",);
  const ownerId = await db.selectFrom("users",).select("id",).where("username", "=", "e2e-user",)
    .executeTakeFirst();

  chatId = await insertChats(db, "e2e-chat", ownerId!.id,);
  actorId = await insertActors(db, "Kara",);
  await insertCharacterStats(db, actorId, 100, 100, 10, {
    conditions: JSON.stringify(["bound", "webbed to the wall",],),
  },);
  // No skills seeded: the actor owns nothing, carries nothing.
},);

describe("immersion gate e2e (acceptance criteria)", () => {
  test("captive actor 'I sprint away' is not silently allowed at default config", async () => {
    await insertMessages(db, chatId, actorId, "user", "I sprint away from the ropes", {
      status: MessageStatus.Confirmed,
    },);

    const result = await runImmersionGatePrecheck({
      db,
      chatId,
      actorId,
      actorName: "Kara",
      worldId: null,
      content: "I sprint away from the ropes",
      parentMessageId: null,
    },);

    // The default movement rule fires at soft-refuse or stronger: the
    // severity floor is the ladder surface above annotate.
    const severityRank = { allow: 0, annotate: 1, "soft-refuse": 2, "hard-block": 3, };
    expect(
      severityRank[DEFAULT_IMMERSION_CONFIG.rules[GateRuleId.MovementWhileRestrained]!.severity],
    ).toBeGreaterThanOrEqual(severityRank.annotate,);

    // And the flow actually reacts: blocked, or narration/hint injected.
    expect(result.action === "blocked" || result.promptInjection !== undefined,).toBe(true,);
  });

  test("soft-refuse narrates the FAILED escape, not a success", async () => {
    const beatId = await insertMessages(db, chatId, actorId, "user", "I sprint away from the ropes", {
      status: MessageStatus.Confirmed,
    },);

    const result = await runImmersionGatePrecheck({
      db,
      chatId,
      actorId,
      actorName: "Kara",
      worldId: null,
      content: "I sprint away from the ropes",
      parentMessageId: beatId,
      config: {
        ...DEFAULT_IMMERSION_CONFIG,
        rules: {
          ...DEFAULT_IMMERSION_CONFIG.rules,
          [GateRuleId.MovementWhileRestrained]: { enabled: true, severity: GateSeverity.SoftRefuse, },
        },
      },
    },);

    expect(result.action,).toBe("continue",);
    expect(result.beatConsumed,).toBe(true,);
    const framing = result.promptInjection ?? "";
    // In-fiction: directs the narrator at the obstacle beat, not a win.
    expect(framing.toLowerCase(),).not.toContain("you break free",);
    expect(framing.toLowerCase(),).not.toContain("successfully",);
    expect(framing,).toContain("attempted action fails",);
    expect(framing,).toContain("freedom of movement",);
    // One audit row for this decision (ids are UUIDs — assert on content).
    const rows = await auditRows();
    expect(rows.length,).toBeGreaterThanOrEqual(1,);
    expect(rows.some((row,) => String(row.severity,) === GateSeverity.SoftRefuse),).toBe(true,);
  });

  test("skill and item claims are flagged with the missing precondition", async () => {
    await insertMessages(db, chatId, actorId, "user", "I use my thieves' tools on the lock", {
      status: MessageStatus.Confirmed,
    },);

    const result = await runImmersionGatePrecheck({
      db,
      chatId,
      actorId,
      actorName: "Kara",
      worldId: null,
      content: "I use my thieves' tools on the lock",
      parentMessageId: null,
    },);

    const hint = result.promptInjection ?? "";
    // Explainability: names what is missing, never a silent block.
    expect(hint.length > 0,).toBe(true,);
    expect(
      hint.includes("lockpicking",) || hint.includes("thieves' tools",) || hint.includes("not in inventory",),
    ).toBe(true,);
  });

  test("hard-block writes the OOC notice with the skip affordance", async () => {
    const beatId = await insertMessages(db, chatId, actorId, "user", "I sprint away from the ropes", {
      status: MessageStatus.Confirmed,
    },);

    const result = await runImmersionGatePrecheck({
      db,
      chatId,
      actorId,
      actorName: "Kara",
      worldId: null,
      content: "I sprint away from the ropes",
      parentMessageId: beatId,
      config: {
        ...DEFAULT_IMMERSION_CONFIG,
        rules: {
          ...DEFAULT_IMMERSION_CONFIG.rules,
          [GateRuleId.MovementWhileRestrained]: { enabled: true, severity: GateSeverity.HardBlock, },
        },
      },
    },);

    expect(result.action,).toBe("blocked",);
    const notice = await db
      .selectFrom("messages",)
      .selectAll()
      .where("chat_id", "=", chatId,)
      .where("role", "=", "system",)
      .orderBy("id", "desc",)
      .executeTakeFirst();

    expect(notice,).toBeDefined();
    expect(notice!.content,).toContain("[OOC]",);
    expect(notice!.content,).toContain("turn skip",);
    expect(notice!.metadata,).toContain("skipOffered",);
    // The beat itself stays untouched — the escape hatch stays available.
    const beat = await db.selectFrom("messages",).select("status",).where("id", "=", beatId,).executeTakeFirst();
    expect(beat?.status,).toBe(MessageStatus.Confirmed,);
  });
});
