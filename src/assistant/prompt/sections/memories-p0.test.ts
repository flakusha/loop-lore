// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** P0 regressions: live injection cooldown + keyphrase recalls under budget. */
import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import { PromptSection, } from "../../../config/sections/prompt";
import { MessageStatus, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { createTestDb, } from "../../../test-utils/create-test-db";
import {
  insertActorMemories,
  insertActors,
  insertChatParticipants,
  insertChats,
  insertMessages,
  insertUsers,
} from "../../../test-utils/insert-helpers";
import type { AssembleContext, } from "../types";
import { memorySection, } from "./memories";

interface Fixture {
  actor: { id: string };
  chat: { id: string };
  db: Kysely<DB>;
  sqlite: { close: () => void };
  user: { id: string };
}

/** Build one isolated chat with an actor, a user and a participant row. */
async function fixture(title: string,): Promise<Fixture> {
  const { db, sqlite, } = await createTestDb();
  await insertUsers(db, "p0-user", "P0 User",);
  const user = await db.selectFrom("users",).select("id",).executeTakeFirstOrThrow();
  await insertActors(db, "P0 Actor", { user_id: user.id, owner_id: user.id, },);
  const actor = await db.selectFrom("actors",).select("id",).executeTakeFirstOrThrow();
  await insertChats(db, title, user.id, { mode: "story", },);
  const chat = await db
    .selectFrom("chats",)
    .select("id",)
    .limit(1,)
    .executeTakeFirstOrThrow();

  await insertChatParticipants(db, chat.id, actor.id,);
  return { actor, chat, db, sqlite, user, };
}

/** Minimal section context with a deterministic injection roll. */
function ctxFor(
  f: Fixture,
  roll: number,
  config?: AssembleContext["config"],
): AssembleContext {
  return {
    db: f.db,
    actor: {
      id: f.actor.id,
      display_name: "P0 Actor",
      system_prompt: null,
      description: null,
      personality: null,
      scenario: null,
      post_history_instructions: null,
      mes_example: null,
      agent_role: null,
    },
    chat: { id: f.chat.id, mode: "story", world_id: null, current_location_id: null, },
    params: { actorId: f.actor.id, chatId: f.chat.id, modelId: "test-model", },
    isStory: false,
    tokenBudget: 8000,
    randomFn: () => roll,
    ...(config ? { config, } : {}),
  };
}

/** Rendered section text for one assembly. */
async function rendered(ctx: AssembleContext,): Promise<string> {
  const messages = await memorySection.build(ctx,);
  return messages.map((m,) => m.content).join("\n",);
}

describe("memorySection — P0 injection regressions", () => {
  test("cooldown suppresses a memory injected on the current turn", async () => {
    try {
      createLogger({ level: "error", },);
    } catch { /* already initialized */ }

    const f = await fixture("Cooldown chat",);
    try {
      await insertMessages(f.db, f.chat.id, f.actor.id, "user", "hello",);
      const marker = `COOLDOWN_MARKER-${randomUUID()}`;
      const memoryId = await insertActorMemories(f.db, f.actor.id, marker, {
        scope: "character",
        privacy: "public",
        importance: 0.9,
      },);

      await f.db.insertInto("memory_audit_log",).values({
        id: randomUUID(),
        memory_id: memoryId,
        actor_id: f.actor.id,
        user_id: f.user.id,
        action: "inject",
        details: JSON.stringify({
          chatId: f.chat.id,
          turnNumber: 1,
          memoryIds: [memoryId,],
        },),
        created_at: new Date().toISOString(),
      },).execute();

      // roll 0 always passes the probability gate — only the cooldown can suppress.
      const output = await rendered(ctxFor(f, 0,),);
      expect(output,).not.toContain(marker,);
    } finally {
      f.sqlite.close();
    }
  });

  test("keyphrase hits share the section token budget and keep the important hit", async () => {
    try {
      createLogger({ level: "error", },);
    } catch { /* already initialized */ }

    const f = await fixture("Keyphrase budget chat",);
    try {
      const key = `p0-key-${randomUUID()}`;
      await insertMessages(f.db, f.chat.id, f.actor.id, "user", `mention ${key}`, {
        status: MessageStatus.Confirmed,
      } as never,);

      const heavyA = `FORCED-A-${"a".repeat(600,)}`;
      const heavyB = `FORCED-B-${"b".repeat(600,)}`;
      await insertActorMemories(f.db, f.actor.id, heavyA, {
        scope: "character",
        privacy: "public",
        importance: 0.9,
        keywords: JSON.stringify([key,],),
      } as never,);

      await insertActorMemories(f.db, f.actor.id, heavyB, {
        scope: "character",
        privacy: "public",
        importance: 0.1,
        keywords: JSON.stringify([key,],),
      } as never,);

      const config = {
        prompt: new PromptSection({ memoryTokenBudget: 256, },),
      } as AssembleContext["config"];

      // roll 0.999 keeps probabilistic injection from admitting either entry.
      const output = await rendered(ctxFor(f, 0.999, config,),);
      expect(output,).toContain("FORCED-A-",);
      expect(output,).not.toContain("FORCED-B-",);
    } finally {
      f.sqlite.close();
    }
  });
});
