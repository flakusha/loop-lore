// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the chat transitions module.
 *
 * Includes ownership / memory-poisoning guard tests for
 * `promoteMessagesToMemories` and `classifyTransitionMessage`.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import type { Database, } from "bun:sqlite";
import { readFile, } from "node:fs/promises";
import { createTestDb, resetTestDb, } from "../test-utils/create-test-db";
import {
  classifyTransitionMessage,
  createTransition,
  promoteMessagesToMemories,
  selectMessagesForPromotion,
} from "./transitions";
import { OwnershipError, } from "./ownership";
import type { DB, } from "../db/schema";
import type { MessageRef, } from "./types";

// ── Pure-function tests ───────────────────────────────────────

describe("createTransition", () => {
  it("creates a description transition", () => {
    const t = createTransition({
      actorId: "user-1",
      narration: "Walking to the tavern",
    },);

    expect(t.type,).toBe("description",);
    expect(t.actorId,).toBe("user-1",);
    expect(t.narration,).toBe("Walking to the tavern",);
    expect(t.promotedMemoryIds,).toEqual([],);
    expect(t.createdAt,).toBeTruthy();
  },);

  it("creates a location change transition", () => {
    const t = createTransition({
      actorId: "user-1",
      newLocationId: "loc-1",
    },);

    expect(t.type,).toBe("location_change",);
    expect(t.newLocationId,).toBe("loc-1",);
  },);

  it("includes promoted memory IDs", () => {
    const t = createTransition({
      actorId: "user-1",
      promotedMemoryIds: ["mem-1", "mem-2",],
    },);

    expect(t.promotedMemoryIds,).toEqual(["mem-1", "mem-2",],);
  },);
});

describe("selectMessagesForPromotion", () => {
  function makeMsg(id: string, content: string, score?: number,): MessageRef {
    return {
      messageId: id,
      role: "user",
      content,
      tokenCount: Math.ceil(content.length * 0.3,),
      createdAt: new Date().toISOString(),
      score,
    };
  }

  it("returns empty when under budget", () => {
    const msgs = [makeMsg("1", "Short message",),];
    const result = selectMessagesForPromotion(msgs, 10_000,);
    expect(result,).toEqual([],);
  },);

  it("promotes messages over budget that meet score threshold", () => {
    const msgs: MessageRef[] = [
      { messageId: "1", role: "user", content: "x".repeat(1000,), tokenCount: 300, createdAt: "", score: 0.2, },
      { messageId: "2", role: "user", content: "y".repeat(1000,), tokenCount: 300, createdAt: "", score: 0.8, },
      { messageId: "3", role: "user", content: "z".repeat(1000,), tokenCount: 300, createdAt: "", score: 0.1, },
    ];
    const result = selectMessagesForPromotion(msgs, 100, 0.6,);
    expect(result,).toContain("2",);
    expect(result,).not.toContain("1",);
    expect(result,).not.toContain("3",);
  },);

  it("uses length heuristic when score is absent", () => {
    const msgs = [
      makeMsg("1", "x".repeat(300,),),
      makeMsg("2", "short",),
    ];
    const result = selectMessagesForPromotion(msgs, 10, 0.6,);
    expect(result.length,).toBeGreaterThan(0,);
  },);
});

// ── Ownership / memory-poisoning guard tests ──────────────────


let db: Kysely<DB>;
let sqlite: Database;

beforeEach(async () => {
  ({ db, sqlite, } = await createTestDb());
},);

afterEach(() => {
  resetTestDb(sqlite,);
});
// Module-scope constants so all ownership-guard describe blocks can share
// the same fixture ids (the test bodies reference these from sibling blocks).
const VICTIM_ID = "victim-1";
const CHAT_OWNED_BY_VICTIM = "chat-victim-owns";
const CHAT_VICTIM_JOINS = "chat-victim-joins";
const CHAT_ATTACKER_JOINS = "chat-attacker-joins";
const NON_PARTICIPANT_ID = "non-participant";
const ATTACKER_ID = "attacker-1";
describe("promoteMessagesToMemories — ownership guard", () => {
  // Create the actor rows referenced by chat_participants.actor_id FK.
  // Tests below reuse these ids across describe blocks.
  beforeAll(async () => {
    for (const id of [VICTIM_ID, NON_PARTICIPANT_ID, ATTACKER_ID,]) {
      await db
        .insertInto("actors")
        .values({
          id,
          actor_type: "user",
          display_name: id,
          owner_id: id,
          agent_type: "none",
          settings: "{}",
          format_version: 0,
          visibility: "private",
          import_spec: "{}",
        },)
        .execute();
    }
    // also create the chats referenced by FK
    for (const chatId of [CHAT_OWNED_BY_VICTIM, "chat-victim-joins", "chat-attacker-joins",]) {
      await db
        .insertInto("chats")
        .values({ id: chatId, name: chatId, created_by: VICTIM_ID, },)
        .execute();
    }
  },);

  it("rejects when the actor is not a participant of the chat (memory poisoning defense)", async () => {
    // The caller (NON_PARTICIPANT_ID) is NOT a participant of CHAT_OWNED_BY_VICTIM.
    // promoteMessagesToMemories must throw OwnershipError and NOT insert any row.
    await db
      .insertInto("chat_participants")
      .values({ chat_id: CHAT_OWNED_BY_VICTIM, actor_id: VICTIM_ID, role_in_chat: "owner" })
      .execute();
    const msgs: MessageRef[] = [{
      messageId: "m1",
      role: "user",
      content: "ATTACKER-CONTROLLED CONTENT — should never land in victim's memory",
      tokenCount: 10_000,
      createdAt: "",
      score: 0.9,
    },];

    let caught: unknown;
    try {
      await promoteMessagesToMemories(db, {
        messages: msgs,
        maxTokens: 100,
        actorId: VICTIM_ID,
        chatId: CHAT_OWNED_BY_VICTIM,
        participantIds: [VICTIM_ID],
      });
    } catch (e) {
      caught = e;
    }

    expect(caught,).toBeInstanceOf(OwnershipError);

    const rows = await db
      .selectFrom("actor_memories")
      .selectAll()
      .where("actor_id", "=", VICTIM_ID)
      .execute();
    expect(rows,).toEqual([]);
  },);

  it("rejects when actor is not a participant of the chat", async () => {
    const msgs: MessageRef[] = [{
      messageId: "m1",
      role: "user",
      content: "some content",
      tokenCount: 10_000,
      createdAt: "",
      score: 0.9,
    },];

    await expect(
      promoteMessagesToMemories(db, {
        messages: msgs,
        maxTokens: 100,
        actorId: ATTACKER_ID,
        chatId: CHAT_OWNED_BY_VICTIM,
        participantIds: [ATTACKER_ID],
      }),
    ).rejects.toBeInstanceOf(OwnershipError);
  },);

  it("rejects non-participant actor against chat they don't belong to", async () => {
    await db
      .insertInto("chat_participants")
      .values({ chat_id: CHAT_VICTIM_JOINS, actor_id: VICTIM_ID, role_in_chat: "member" })
      .execute();

    const msgs: MessageRef[] = [{
      messageId: "m1",
      role: "user",
      content: "x".repeat(2000),
      tokenCount: 2000,
      createdAt: "",
      score: 0.9,
    },];

    await expect(
      promoteMessagesToMemories(db, {
        messages: msgs,
        maxTokens: 100,
        actorId: ATTACKER_ID,
        chatId: CHAT_VICTIM_JOINS,
        participantIds: [VICTIM_ID],
      }),
    ).rejects.toBeInstanceOf(OwnershipError);
  },);

  it("allows legitimate call when actor is a participant of the chat", async () => {
    await db
      .insertInto("chat_participants")
      .values({ chat_id: CHAT_OWNED_BY_VICTIM, actor_id: VICTIM_ID, role_in_chat: "owner" })
      .execute();

    const msgs: MessageRef[] = [{
      messageId: "m1",
      role: "user",
      content: "x".repeat(2000),
      tokenCount: 2000,
      createdAt: "",
      score: 0.9,
    },];

    const ids = await promoteMessagesToMemories(db, {
      messages: msgs,
      maxTokens: 100,
      actorId: VICTIM_ID,
      chatId: CHAT_OWNED_BY_VICTIM,
      participantIds: [VICTIM_ID],
    });

    expect(ids.length,).toBe(1);
    const stored = await db
      .selectFrom("actor_memories")
      .selectAll()
      .where("actor_id", "=", VICTIM_ID)
      .execute();
    expect(stored.length,).toBe(1);
    expect(stored[0]?.source_chat_id,).toBe(CHAT_OWNED_BY_VICTIM);
  },);
});

describe("classifyTransitionMessage ownership guard", () => {
  it("rejects when ownership context is provided but actor is not a participant", async () => {
    await expect(
      classifyTransitionMessage(
        "I travel to the mountains.",
        [],
        {} as never,
        db,
        undefined,
        { chatId: CHAT_OWNED_BY_VICTIM, actorId: ATTACKER_ID },
      ),
    ).rejects.toBeInstanceOf(OwnershipError);
  },);
  beforeAll(async () => {
    // re-create chats/actors in case the prior describe's afterEach wiped them.
    // Swallow unique-key collisions because resetTestDb may have left rows.
    for (const chatId of [CHAT_OWNED_BY_VICTIM, CHAT_VICTIM_JOINS, CHAT_ATTACKER_JOINS,]) {
      try {
        await db
          .insertInto("chats")
          .values({ id: chatId, name: chatId, created_by: VICTIM_ID, },)
          .execute();
      } catch { /* already exists */ }
    }
    for (const id of [VICTIM_ID, NON_PARTICIPANT_ID, ATTACKER_ID,]) {
      try {
        await db
          .insertInto("actors")
          .values({
            id,
            actor_type: "user",
            display_name: id,
            owner_id: id,
            agent_type: "none",
            settings: "{}",
            format_version: 0,
            visibility: "private",
            import_spec: "{}",
          },)
          .execute();
      } catch { /* already exists */ }
    }
  },);

  it("allows when ownership context is provided and actor is a participant", async () => {
    await db
      .insertInto("chat_participants")
      .values({ chat_id: CHAT_OWNED_BY_VICTIM, actor_id: VICTIM_ID, role_in_chat: "owner" })
      .execute();

    const result = await classifyTransitionMessage(
      "I travel to the mountains.",
      [],
      {} as never,
      db,
      VICTIM_ID,
      { chatId: CHAT_OWNED_BY_VICTIM, actorId: VICTIM_ID },
    );

    expect(result.isTransition,).toBe(true);
    expect(result.type,).toBe("location_change");
  },);

  it("rejects when userId is provided but does not correspond to an actor", async () => {
    await expect(
      classifyTransitionMessage(
        "I travel to the mountains.",
        [],
        {} as never,
        db,
        "ghost-user-id",
      ),
    ).rejects.toBeInstanceOf(OwnershipError);
  },);
});

// ── Audit: enumerate every exported function and confirm coverage ──

describe("ownership audit (exported-function coverage)", () => {
  it("covers all exported functions with appropriate guards", async () => {
    const src = await readFile(
      new URL("./transitions.ts", import.meta.url),
      "utf8",
    );

    const exportedFns = [
      "classifyTransitionMessage",
      "createTransition",
      "selectMessagesForPromotion",
      "promoteMessagesToMemories",
    ];

    const mustGuard = [
      "classifyTransitionMessage",
      "promoteMessagesToMemories",
    ];

    const pure: Record<string, true> = {
      createTransition: true,
      selectMessagesForPromotion: true,
    };

    for (const fn of exportedFns) {
      const fnBlockRe = new RegExp(
        `(?:export\\s+(?:async\\s+)?function\\s+${fn}\\s*\\([^)]*\\)\\s*[^{]*\\{)([\\s\\S]*?)\\n\\}`,
        "m",
      );
      const m = fnBlockRe.exec(src);
      expect(m,).not.toBeNull();
      const body = m?.[1] ?? "";

      if (mustGuard.includes(fn)) {
        const hasGuard = /requireChatParticipant|requireActorExists/.test(body);
        expect(
          hasGuard,
          `expected ${fn} to call an ownership guard`,
        ).toBe(true);
      }
      if (pure[fn]) {
        const hasGuard = /requireChatParticipant|requireActorExists/.test(body);
        expect(
          hasGuard,
          `${fn} is a pure function and must NOT call an ownership guard`,
        ).toBe(false);
      }
    }
  },);
});

// ── Ownership / memory-poisoning guard tests ──────────────────

let db: Kysely<DB>;
let sqlite: Database;

beforeEach(async () => {
  ({ db, sqlite, } = await createTestDb());
},);

afterEach(() => {
  resetTestDb(sqlite,);
},);
// Module-scope constants so all ownership-guard describe blocks can share
// the same fixture ids (the test bodies reference these from sibling blocks).
const VICTIM_ID = "victim-1";
const CHAT_OWNED_BY_VICTIM = "chat-victim-owns";
const CHAT_VICTIM_JOINS = "chat-victim-joins";
const CHAT_ATTACKER_JOINS = "chat-attacker-joins";
const NON_PARTICIPANT_ID = "non-participant";
const ATTACKER_ID = "attacker-1";
describe("promoteMessagesToMemories — ownership guard", () => {
  // Create the actor rows referenced by chat_participants.actor_id FK.
  // Tests below reuse these ids across describe blocks.
  beforeAll(async () => {
    for (const id of [VICTIM_ID, NON_PARTICIPANT_ID, ATTACKER_ID,]) {
      await db
        .insertInto("actors",)
        .values({
          id,
          actor_type: "user",
          display_name: id,
          owner_id: id,
          agent_type: "none",
          settings: "{}",
          format_version: 0,
          visibility: "private",
          import_spec: "{}",
        },)
        .execute();
    }
    // also create the chats referenced by FK
    for (const chatId of [CHAT_OWNED_BY_VICTIM, "chat-victim-joins", "chat-attacker-joins",]) {
      await db
        .insertInto("chats",)
        .values({ id: chatId, name: chatId, created_by: VICTIM_ID, },)
        .execute();
    }
  },);

  it("rejects when the actor is not a participant of the chat (memory poisoning defense)", async () => {
    // The caller (NON_PARTICIPANT_ID) is NOT a participant of CHAT_OWNED_BY_VICTIM.
    // promoteMessagesToMemories must throw OwnershipError and NOT insert any row.
    await db
      .insertInto("chat_participants",)
      .values({ chat_id: CHAT_OWNED_BY_VICTIM, actor_id: VICTIM_ID, role_in_chat: "owner", },)
      .execute();
    const msgs: MessageRef[] = [{
      messageId: "m1",
      role: "user",
      content: "ATTACKER-CONTROLLED CONTENT — should never land in victim's memory",
      tokenCount: 10_000,
      createdAt: "",
      score: 0.9,
    },];

    let caught: unknown;
    try {
      await promoteMessagesToMemories(db, {
        messages: msgs,
        maxTokens: 100,
        actorId: VICTIM_ID,
        chatId: CHAT_OWNED_BY_VICTIM,
        participantIds: [VICTIM_ID,],
      },);
    } catch (e) {
      caught = e;
    }

    expect(caught,).toBeInstanceOf(OwnershipError,);

    const rows = await db
      .selectFrom("actor_memories",)
      .selectAll()
      .where("actor_id", "=", VICTIM_ID,)
      .execute();
    expect(rows,).toEqual([],);
  });

  it("rejects when actor is not a participant of the chat", async () => {
    const msgs: MessageRef[] = [{
      messageId: "m1",
      role: "user",
      content: "some content",
      tokenCount: 10_000,
      createdAt: "",
      score: 0.9,
    },];

    await expect(
      promoteMessagesToMemories(db, {
        messages: msgs,
        maxTokens: 100,
        actorId: ATTACKER_ID,
        chatId: CHAT_OWNED_BY_VICTIM,
        participantIds: [ATTACKER_ID,],
      },),
    ).rejects.toBeInstanceOf(OwnershipError,);
  });

  it("rejects non-participant actor against chat they don't belong to", async () => {
    await db
      .insertInto("chat_participants",)
      .values({ chat_id: CHAT_VICTIM_JOINS, actor_id: VICTIM_ID, role_in_chat: "member", },)
      .execute();

    const msgs: MessageRef[] = [{
      messageId: "m1",
      role: "user",
      content: "x".repeat(2000,),
      tokenCount: 2000,
      createdAt: "",
      score: 0.9,
    },];

    await expect(
      promoteMessagesToMemories(db, {
        messages: msgs,
        maxTokens: 100,
        actorId: ATTACKER_ID,
        chatId: CHAT_VICTIM_JOINS,
        participantIds: [VICTIM_ID,],
      },),
    ).rejects.toBeInstanceOf(OwnershipError,);
  });

  it("allows legitimate call when actor is a participant of the chat", async () => {
    await db
      .insertInto("chat_participants",)
      .values({ chat_id: CHAT_OWNED_BY_VICTIM, actor_id: VICTIM_ID, role_in_chat: "owner", },)
      .execute();

    const msgs: MessageRef[] = [{
      messageId: "m1",
      role: "user",
      content: "x".repeat(2000,),
      tokenCount: 2000,
      createdAt: "",
      score: 0.9,
    },];

    const ids = await promoteMessagesToMemories(db, {
      messages: msgs,
      maxTokens: 100,
      actorId: VICTIM_ID,
      chatId: CHAT_OWNED_BY_VICTIM,
      participantIds: [VICTIM_ID,],
    },);

    expect(ids.length,).toBe(1,);
    const stored = await db
      .selectFrom("actor_memories",)
      .selectAll()
      .where("actor_id", "=", VICTIM_ID,)
      .execute();
    expect(stored.length,).toBe(1,);
    expect(stored[0]?.source_chat_id,).toBe(CHAT_OWNED_BY_VICTIM,);
  });
});

describe("classifyTransitionMessage ownership guard", () => {
  it("rejects when ownership context is provided but actor is not a participant", async () => {
    await expect(
      classifyTransitionMessage(
        "I travel to the mountains.",
        [],
        {} as never,
        db,
        undefined,
        { chatId: CHAT_OWNED_BY_VICTIM, actorId: ATTACKER_ID, },
      ),
    ).rejects.toBeInstanceOf(OwnershipError,);
  });
  beforeAll(async () => {
    // re-create chats/actors in case the prior describe's afterEach wiped them.
    // Swallow unique-key collisions because resetTestDb may have left rows.
    for (const chatId of [CHAT_OWNED_BY_VICTIM, CHAT_VICTIM_JOINS, CHAT_ATTACKER_JOINS,]) {
      try {
        await db
          .insertInto("chats",)
          .values({ id: chatId, name: chatId, created_by: VICTIM_ID, },)
          .execute();
      } catch { /* already exists */ }
    }
    for (const id of [VICTIM_ID, NON_PARTICIPANT_ID, ATTACKER_ID,]) {
      try {
        await db
          .insertInto("actors",)
          .values({
            id,
            actor_type: "user",
            display_name: id,
            owner_id: id,
            agent_type: "none",
            settings: "{}",
            format_version: 0,
            visibility: "private",
            import_spec: "{}",
          },)
          .execute();
      } catch { /* already exists */ }
    }
  },);

  it("allows when ownership context is provided and actor is a participant", async () => {
    await db
      .insertInto("chat_participants",)
      .values({ chat_id: CHAT_OWNED_BY_VICTIM, actor_id: VICTIM_ID, role_in_chat: "owner", },)
      .execute();

    const result = await classifyTransitionMessage(
      "I travel to the mountains.",
      [],
      {} as never,
      db,
      VICTIM_ID,
      { chatId: CHAT_OWNED_BY_VICTIM, actorId: VICTIM_ID, },
    );

    expect(result.isTransition,).toBe(true,);
    expect(result.type,).toBe("location_change",);
  });

  it("rejects when userId is provided but does not correspond to an actor", async () => {
    await expect(
      classifyTransitionMessage(
        "I travel to the mountains.",
        [],
        {} as never,
        db,
        "ghost-user-id",
      ),
    ).rejects.toBeInstanceOf(OwnershipError,);
  });
});

// ── Audit: enumerate every exported function and confirm coverage ──

describe("ownership audit (exported-function coverage)", () => {
  it("covers all exported functions with appropriate guards", async () => {
    const src = await readFile(
      new URL("./transitions.ts", import.meta.url,),
      "utf8",
    );

    const exportedFns = [
      "classifyTransitionMessage",
      "createTransition",
      "selectMessagesForPromotion",
      "promoteMessagesToMemories",
    ];

    const mustGuard = [
      "classifyTransitionMessage",
      "promoteMessagesToMemories",
    ];

    const pure: Record<string, true> = {
      createTransition: true,
      selectMessagesForPromotion: true,
    };

    for (const fn of exportedFns) {
      const fnBlockRe = new RegExp(
        `(?:export\\s+(?:async\\s+)?function\\s+${fn}\\s*\\([^)]*\\)\\s*[^{]*\\{)([\\s\\S]*?)\\n\\}`,
        "m",
      );
      const m = fnBlockRe.exec(src,);
      expect(m,).not.toBeNull();
      const body = m?.[1] ?? "";

      if (mustGuard.includes(fn,)) {
        const hasGuard = /requireChatParticipant|requireActorExists/.test(body,);
        expect(
          hasGuard,
          `expected ${fn} to call an ownership guard`,
        ).toBe(true,);
      }
      if (pure[fn]) {
        const hasGuard = /requireChatParticipant|requireActorExists/.test(body,);
        expect(
          hasGuard,
          `${fn} is a pure function and must NOT call an ownership guard`,
        ).toBe(false,);
      }
    }
  });
});
