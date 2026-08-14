/**
 * Integration test — pinned memory is injected into the prompt context.
 *
 * Regression guard for the memory-selection UI's pin control: a memory the
 * user explicitly pins for a chat MUST appear in that chat's assembled prompt
 * (the `shouldInjectMemory` pinned-override makes this deterministic, whereas
 * unpinned memories are injected probabilistically).
 */
import { describe, expect, test, } from "bun:test";
import type { Generated, } from "kysely";
import type { ChatMode, } from "../../../db/enums-core";
import { createLogger, } from "../../../logger";
import { createTestDb, } from "../../../test-utils/create-test-db";
import {
  insertActorMemories,
  insertActors,
  insertChatParticipants,
  insertChats,
  insertUsers,
} from "../../../test-utils/insert-helpers";
import type { AssembleContext, } from "../types";
import { memorySection, } from "./memories";

const characterScope = "character" as unknown as Generated<string>;
const publicPrivacy = "public" as unknown as Generated<string>;
const pinnedFlag = 1 as unknown as Generated<number>;
const storyMode = "story" as unknown as Generated<ChatMode>;

describe("memorySection — pinned memory injection", () => {
  test("a pinned memory is always present in the assembled prompt", async () => {
    try {
      createLogger({ level: "error", },);
    } catch {
      // Already initialized — ignore.
    }

    const { db, sqlite, } = await createTestDb();
    try {
      await insertUsers(db, "human", "Human",);
      await insertActors(db, "Character",);
      const users = await db.selectFrom("users",).select(["id", "username",],).execute();
      const actors = await db.selectFrom("actors",).select(["id", "display_name",],).execute();
      const userId = users.find((u,) => u.username === "human")!.id;
      const charId = actors.find((a,) => a.display_name === "Character")!.id;

      await insertChats(db, "Pin chat", userId, { mode: storyMode, },);
      const chat = await db.selectFrom("chats",).select(["id",],).limit(1,).executeTakeFirstOrThrow();
      const chatId = chat.id;
      await insertChatParticipants(db, chatId, charId,);

      await insertActorMemories(db, charId, "PINNED_MEMORY_MARKER: the lighthouse guides sailors.", {
        scope: characterScope,
        privacy: publicPrivacy,
        pinned: pinnedFlag,
      },);

      const ctx: AssembleContext = {
        db,
        actor: {
          id: charId,
          display_name: "Character",
          system_prompt: null,
          description: null,
          personality: null,
          scenario: null,
          post_history_instructions: null,
          mes_example: null,
          agent_role: null,
        },
        chat: { id: chatId, mode: "story", world_id: null, current_location_id: null, },
        params: { actorId: charId, chatId, modelId: "test-model", },
        isStory: false,
        tokenBudget: 4000,
      };

      const messages = await memorySection.build(ctx,);
      const output = messages.map((m,) => m.content).join("\n",);

      expect(output,).toContain("PINNED_MEMORY_MARKER",);
    } finally {
      sqlite.close();
    }
  });
});
