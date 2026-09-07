// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Group talkativity prompt section tests
 * (BUG-group-chat-talkativity-not-surfaced-in-prompt).
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { createTestDb, } from "../../../test-utils/create-test-db";
import {
  insertActors,
  insertChats,
  insertUsers,
} from "../../../test-utils/insert-helpers";
import type { AssembleContext, } from "../types";
import { groupTalkativitySection, } from "./group-talkativity";

describe("groupTalkativitySection", () => {
  let db: Kysely<DB>;
  let actorAlpha: string;
  let actorBeta: string;
  let actorGamma: string;
  let chatId: string;

  beforeAll(async () => {
    try {
      createLogger({ level: "error", },);
    } catch { /* already initialized */ }

    const dbHandle = await createTestDb();
    db = dbHandle.db;
    await insertUsers(db, "gm", "GM",);
    const user = await db.selectFrom("users",).select(["id",],).limit(1,).executeTakeFirstOrThrow();
    await insertActors(db, "Alpha",);
    await insertActors(db, "Beta",);
    await insertActors(db, "Gamma",);
    const actors = await db.selectFrom("actors",).select(["id", "display_name",],).orderBy("display_name",).execute();
    const byName = Object.fromEntries(actors.map((a,) => [a.display_name!, a.id,]),);
    actorAlpha = byName["Alpha"]!;
    actorBeta = byName["Beta"]!;
    actorGamma = byName["Gamma"]!;

    chatId = "chat-talk-1";
    await insertChats(db, "Talk Chat", user.id, { id: chatId as never, },);

    await db
      .insertInto("chat_participants",)
      .values([
        { chat_id: chatId, actor_id: actorAlpha, role_in_chat: "member", talkativity: 8, },
        { chat_id: chatId, actor_id: actorBeta, role_in_chat: "member", talkativity: 3, },
        { chat_id: chatId, actor_id: actorGamma, role_in_chat: "member", talkativity: 5, },
      ],)
      .execute();
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  function ctxFor(ids: string[],): AssembleContext {
    return {
      db,
      actor: {
        id: actorAlpha,
        display_name: "Alpha",
        system_prompt: null,
        description: null,
        personality: null,
        scenario: null,
        post_history_instructions: null,
        mes_example: null,
        agent_role: null,
      },
      chat: { id: chatId, mode: "group", world_id: null, current_location_id: null, },
      params: { actorId: actorAlpha, chatId, modelId: "test-model", groupParticipantIds: ids, },
      isStory: false,
      tokenBudget: 4000,
    };
  }

  test("renders per-actor talkativity lines for listed participants", async () => {
    const ctx = ctxFor([actorAlpha, actorBeta,],);
    expect(groupTalkativitySection.enabled(ctx,),).toBe(true,);
    const msgs = await groupTalkativitySection.build(ctx,);
    expect(msgs,).toHaveLength(1,);
    const content = msgs[0]!.content;
    expect(content,).toContain("Alpha: 8/10",);
    expect(content,).toContain("Beta: 3/10",);
    expect(content,).toContain("Group Talkativity",);
  });

  test("disabled when no group participants set", () => {
    const ctx = ctxFor([],);
    expect(groupTalkativitySection.enabled(ctx,),).toBe(false,);
  });

  test("renders Gamma (talkativity=5) when listed", async () => {
    const ctx = ctxFor([actorAlpha, actorGamma,],);
    const msgs = await groupTalkativitySection.build(ctx,);
    expect(msgs[0]!.content,).toContain("Gamma: 5/10",);
  });

  test("filters out actors not in the chat (chat-scoped join)", async () => {
    // Beta (3) is in the chat but NOT in our list — section must exclude it.
    const ctx = ctxFor([actorAlpha, actorGamma,],);
    const msgs = await groupTalkativitySection.build(ctx,);
    const content = msgs[0]!.content;
    expect(content,).not.toContain("Beta:",);
  });
});
