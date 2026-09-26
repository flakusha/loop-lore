/**
 * Tests for the turn-skip absence prompt section
 * (`turnSkipAbsence` — TASK-turn-skip-gm-absence-contract).
 *
 * Verifies:
 * - No turn_skip events → empty section.
 * - Hold skips → hold rule injected; no time-elapse cues.
 * - Advance skips → advance rule injected; time-elapse cue present.
 * - Mixed modes → both clauses rendered.
 * - The hold/advance rules explicitly forbid narrating the absent actor
 *   into autonomous action (the core acceptance criterion).
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { MessageContentType, MessageRole, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { createTestDb, } from "../../../test-utils/create-test-db";
import { insertActors, insertChats, insertMessages, insertUsers, } from "../../../test-utils/insert-helpers";
import { turnSkipAbsenceSection, } from "./turn-skip-absence";

function makeCtx(db: Kysely<DB>, chatId: string,) {
  return {
    db,
    actor: {
      id: "actor-1",
      display_name: null,
      system_prompt: null,
      description: null,
      personality: null,
      scenario: null,
      post_history_instructions: null,
      mes_example: null,
      agent_role: null,
    },
    chat: { id: chatId, mode: "story", world_id: null, current_location_id: null, },
    params: { actorId: "actor-1", chatId, modelId: "test-model", },
    isStory: true,
    tokenBudget: 32_000,
  };
}

async function seedTurnSkip(
  db: Kysely<DB>,
  chatId: string,
  mode: "hold" | "advance",
  actorId = "actor-1",
): Promise<string> {
  // Mirror `recordTurnSkip` storage shape (TASK-turn-skip-event-and-persistence):
  // mode lives in `metadata.turnSkip.mode` as JSON; the section reads it via
  // `json_extract`.
  const metadata = JSON.stringify({ turnSkip: { mode, reason: null, }, },);
  return insertMessages(db, chatId, actorId, MessageRole.System, `skips this beat (${mode})`, {
    content_type: MessageContentType.TurnSkip,
    content_plaintext: `skips this beat (${mode})`,
    metadata,
  },);
}

describe("turnSkipAbsenceSection", () => {
  let db: Kysely<DB>;
  const OWNER = crypto.randomUUID();
  const CHAT = crypto.randomUUID();

  beforeEach(async () => {
    const { db: d, sqlite, } = await createTestDb();
    db = d;
    await insertUsers(db, "owner", "Owner", { id: OWNER as never, },);
    await insertChats(db, "skip-abs", OWNER, { id: CHAT as never, },);
    // Seed the actors referenced by tests (FK on messages.actor_id).
    await insertActors(db, "actor-1", { id: "actor-1", user_id: OWNER, owner_id: OWNER, } as never,);
    await insertActors(db, "actor-a", { id: "actor-a", user_id: OWNER, owner_id: OWNER, } as never,);
    await insertActors(db, "actor-b", { id: "actor-b", user_id: OWNER, owner_id: OWNER, } as never,);
    return () => sqlite.close();
  },);

  afterEach(async () => {
    await db.destroy();
  },);

  test("returns empty section when no turn_skip events exist", async () => {
    await insertMessages(db, CHAT, "actor-1", MessageRole.Character, "Hello there.",);
    const out = await turnSkipAbsenceSection.build(makeCtx(db, CHAT,),);
    expect(out,).toEqual([],);
  });

  test("hold skip emits the hold rule and forbids autonomous action", async () => {
    await seedTurnSkip(db, CHAT, "hold",);
    const out = await turnSkipAbsenceSection.build(makeCtx(db, CHAT,),);
    expect(out,).toHaveLength(1,);
    const msg = out[0]!;
    expect(msg.role,).toBe("system",);
    expect(msg.content,).toContain("<turn_skip_hold>",);
    // The absence rule is the acceptance criterion — must appear verbatim.
    expect(msg.content,).toContain("NOT narrated into autonomous action",);
    // Hold must NOT mention elapsing scene time (advance-only cue).
    expect(msg.content,).not.toContain("elapse scene time",);
  });

  test("advance skip emits the advance rule with the time-elapse cue", async () => {
    await seedTurnSkip(db, CHAT, "advance",);
    const out = await turnSkipAbsenceSection.build(makeCtx(db, CHAT,),);
    expect(out,).toHaveLength(1,);
    const msg = out[0]!;
    expect(msg.content,).toContain("<turn_skip_advance>",);
    expect(msg.content,).toContain("elapse scene time",);
    expect(msg.content,).toContain("NOT narrated into autonomous action",);
  });

  test("mixed hold + advance emits both clauses", async () => {
    await seedTurnSkip(db, CHAT, "hold", "actor-a",);
    await seedTurnSkip(db, CHAT, "advance", "actor-b",);
    const out = await turnSkipAbsenceSection.build(makeCtx(db, CHAT,),);
    expect(out,).toHaveLength(1,);
    const msg = out[0]!;
    expect(msg.content,).toContain("<turn_skip_hold>",);
    expect(msg.content,).toContain("<turn_skip_advance>",);
    expect(msg.content,).toContain("(1) issued hold skips",);
    expect(msg.content,).toContain("(1) issued advance skips",);
  });

  test("ignores non-turn_skip messages in the recent log", async () => {
    await insertMessages(db, CHAT, "actor-1", MessageRole.Character, "Just talking.",);
    const out = await turnSkipAbsenceSection.build(makeCtx(db, CHAT,),);
    expect(out,).toEqual([],);
  });
});
