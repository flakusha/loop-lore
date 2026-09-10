// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * groupParticipantsSection tests — surface character cards for the other
 * actors in a group chat so the generating LLM knows who it is talking to.
 *
 * The section is gated on `params.groupParticipantIds` being a non-empty
 * array; when no participants are present it is skipped entirely. When
 * present, every other actor's display_name / description / personality is
 * rendered into a single `[Other Participants]` system message.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { createTestDb, } from "../../../test-utils/create-test-db";
import { insertActors, insertChats, insertUsers, } from "../../../test-utils/insert-helpers";
import type { AssembleContext, } from "../types";
import { groupParticipantsSection, } from "./group-participants";

describe("groupParticipantsSection", () => {
  let db: Kysely<DB>;
  let userId: string;
  let alphaId: string;
  let betaId: string;
  let gammaId: string;
  let chatId: string;

  beforeAll(async () => {
    try {
      createLogger({ level: "error", },);
    } catch { /* already initialized */ }

    ({ db, } = await createTestDb());
    await insertUsers(db, "gm", "GM",);
    const user = await db.selectFrom("users",).select(["id",],).limit(1,).executeTakeFirstOrThrow();
    userId = user.id;

    await insertActors(db, "Alpha", { description: "leader", personality: "decisive", },);
    await insertActors(db, "Beta", { description: "trickster", },);
    await insertActors(db, "Gamma", {},);
    await insertActors(db, "Solo", { id: "actor-bare-1", },);
    const actors = await db.selectFrom("actors",).select(["id", "display_name",],)
      .orderBy("display_name",).execute();
    const byName: Record<string, string> = Object.fromEntries(
      actors.map((a,) => [a.display_name!, a.id,]),
    );
    alphaId = byName["Alpha"]!;
    betaId = byName["Beta"]!;
    gammaId = byName["Gamma"]!;

    chatId = "chat-group-participants-1";
    await insertChats(db, "Group Chat", userId, { id: chatId as never, },);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  function ctxFor(ids: string[] | undefined,): AssembleContext {
    return {
      db,
      actor: {
        id: alphaId,
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
      params: { actorId: alphaId, chatId, modelId: "test-model", groupParticipantIds: ids, },
      isStory: false,
      tokenBudget: 4000,
    };
  }

  test("disabled when groupParticipantIds is undefined", () => {
    expect(groupParticipantsSection.enabled(ctxFor(undefined,),),).toBe(false,);
  });

  test("disabled when groupParticipantIds is empty", () => {
    expect(groupParticipantsSection.enabled(ctxFor([],),),).toBe(false,);
  });

  test("enabled when groupParticipantIds is non-empty", () => {
    expect(groupParticipantsSection.enabled(ctxFor([betaId,],),),).toBe(true,);
  });

  test("build returns [] when none of the requested participants resolve to actors", async () => {
    const ctx = ctxFor(["ghost-id-1", "ghost-id-2",],);
    const messages = await groupParticipantsSection.build(ctx,);
    expect(messages,).toEqual([],);
  });

  test("build emits a single system message with cards for resolved participants", async () => {
    const ctx = ctxFor([betaId, alphaId, gammaId,],);
    const messages = await groupParticipantsSection.build(ctx,);

    expect(messages.length,).toBe(1,);
    const message = messages[0]!;
    expect(message.role,).toBe("system",);
    const content = message.content;
    expect(content.startsWith("[Other Participants]",),).toBe(true,);
    expect(content,).toContain("Alpha",);
    expect(content,).toContain("Beta",);
    expect(content,).toContain("Gamma",);
    expect(content,).toContain("leader",);
    expect(content,).toContain("decisive",);
    expect(content,).toContain("trickster",);
  });

  test("name-only actor (no description / personality) renders a bare-name card", async () => {
    const messages = await groupParticipantsSection.build(ctxFor(["actor-bare-1",],),);
    expect(messages.length,).toBe(1,);
    const content = messages[0]!.content;
    expect(content.startsWith("[Other Participants]",),).toBe(true,);
    expect(content,).toContain("\n- Solo",);
    // No description → no "— " segment. No personality → no "(...)" segment.
    expect(content,).not.toContain("— ",);
    expect(content,).not.toContain("()",);
  });
});
