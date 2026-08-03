/**
 * Unit tests for the GM notes prompt section (`gmNotes`).
 *
 * Verifies whitenote + shadow-note injection into the assembled prompt:
 * - active whitenotes rendered with type/priority/scope
 * - expired whitenotes filtered out at assembly time
 * - unrevealed shadow notes rendered
 * - revealed shadow notes excluded
 * - no notes → empty section
 */
import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { ShadowNoteType, WhiteneoteType, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { createTestDb, } from "../../../test-utils/create-test-db";
import {
  insertChats,
  insertShadowNotes,
  insertUsers,
  insertWhitenotes,
  insertWorlds,
} from "../../../test-utils/insert-helpers";
import { gmNotesSection, } from "./gm-notes";

function makeCtx(db: Kysely<DB>, chatId: string,) {
  return {
    db,
    actor: {
      id: "actor-1",
      display_name: "Test Actor",
      system_prompt: null,
      description: null,
      personality: null,
      scenario: null,
      post_history_instructions: null,
      mes_example: null,
      agent_role: null,
    },
    chat: { id: chatId, mode: "story", world_id: "world-1", current_location_id: null, },
    params: { actorId: "actor-1", chatId, modelId: "test-model", },
    isStory: true,
    tokenBudget: 32_000,
  };
}

describe("gmNotesSection", () => {
  test("renders active whitenotes + unrevealed shadow notes", async () => {
    const { db, } = await createTestDb();
    await insertUsers(db, "user1", "User 1", { id: "user-1", } as any,);
    await insertWorlds(db, "user-1", "Test World", { id: "world-1", } as any,);
    await insertChats(db, "Test Chat", "user-1", { id: "chat-1", world_id: "world-1", } as any,);
    await insertWhitenotes(
      db,
      "chat-1",
      WhiteneoteType.NarrativeDirection,
      "Focus on the mysterious door.",
      "2026-08-01T00:00:00Z",
      { priority: 8, scope: "scene", } as any,
    );
    await insertShadowNotes(db, "chat-1", ShadowNoteType.WorldSecret, "The king is a lich.", "2026-08-01T00:00:00Z",);

    const messages = await gmNotesSection.build(makeCtx(db, "chat-1",),);
    expect(messages,).toHaveLength(1,);
    expect(messages[0]!.role,).toBe("system",);
    const content = messages[0]!.content;
    expect(content,).toContain("Focus on the mysterious door",);
    expect(content,).toContain("narrative_direction",);
    expect(content,).toContain("priority 8",);
    expect(content,).toContain("The king is a lich.",);
    expect(content,).toContain("world_secret",);
  });

  test("filters expired whitenotes at assembly time", async () => {
    const { db, } = await createTestDb();
    await insertUsers(db, "user1", "User 1", { id: "user-1", } as any,);
    await insertWorlds(db, "user-1", "Test World", { id: "world-1", } as any,);
    await insertChats(db, "Test Chat", "user-1", { id: "chat-1", world_id: "world-1", } as any,);
    await insertWhitenotes(
      db,
      "chat-1",
      WhiteneoteType.Tone,
      "Keep it eerie.",
      "2026-07-01T00:00:00Z",
      { expires_at: "2026-07-02T00:00:00Z", } as any,
    );
    await insertWhitenotes(
      db,
      "chat-1",
      WhiteneoteType.Tone,
      "Keep it hopeful.",
      "2026-08-01T00:00:00Z",
      { expires_at: "2099-01-01T00:00:00Z", } as any,
    );

    const messages = await gmNotesSection.build(makeCtx(db, "chat-1",),);
    const content = messages[0]?.content ?? "";
    expect(content,).not.toContain("Keep it eerie.",);
    expect(content,).toContain("Keep it hopeful.",);
  });

  test("excludes revealed shadow notes", async () => {
    const { db, } = await createTestDb();
    await insertUsers(db, "user1", "User 1", { id: "user-1", } as any,);
    await insertWorlds(db, "user-1", "Test World", { id: "world-1", } as any,);
    await insertChats(db, "Test Chat", "user-1", { id: "chat-1", world_id: "world-1", } as any,);
    await insertShadowNotes(
      db,
      "chat-1",
      ShadowNoteType.Foreshadowing,
      "Hidden one.",
      "2026-08-01T00:00:00Z",
      { revealed: 1, } as any,
    );
    await insertShadowNotes(
      db,
      "chat-1",
      ShadowNoteType.Foreshadowing,
      "Hidden two.",
      "2026-08-01T00:00:00Z",
      { revealed: 0, } as any,
    );

    const messages = await gmNotesSection.build(makeCtx(db, "chat-1",),);
    const content = messages[0]?.content ?? "";
    expect(content,).not.toContain("Hidden one.",);
    expect(content,).toContain("Hidden two.",);
  });

  test("returns empty when no notes exist (and other chats are isolated)", async () => {
    const { db, } = await createTestDb();
    await insertUsers(db, "user1", "User 1", { id: "user-1", } as any,);
    await insertChats(db, "Test Chat", "user-1", { id: "other-chat", } as any,);
    await insertWhitenotes(db, "other-chat", WhiteneoteType.Theme, "Belongs elsewhere.", "2026-08-01T00:00:00Z",);

    const messages = await gmNotesSection.build(makeCtx(db, "chat-1",),);
    expect(messages,).toHaveLength(0,);
  });

  test("caps note volume at MAX_* limits", async () => {
    const { db, } = await createTestDb();
    await insertUsers(db, "user1", "User 1", { id: "user-1", } as any,);
    await insertWorlds(db, "user-1", "Test World", { id: "world-1", } as any,);
    await insertChats(db, "Test Chat", "user-1", { id: "chat-1", world_id: "world-1", } as any,);
    for (let i = 0; i < 15; i++) {
      await insertWhitenotes(
        db,
        "chat-1",
        WhiteneoteType.Pacing,
        `Whitenote ${i}`,
        "2026-08-01T00:00:00Z",
        { priority: i, } as any,
      );
    }
    const messages = await gmNotesSection.build(makeCtx(db, "chat-1",),);
    const content = messages[0]!.content;
    expect(content.match(/Whitenote \d+/g,),).toHaveLength(10,);
  });
});
