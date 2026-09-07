// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /quest command tests — list/create/status/complete subcommands against an
 * in-memory database, including world scoping and edge cases.
 */
import { beforeAll, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import { QuestStatus, QuestType, } from "../../db/enums-story";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertQuests, insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
import "./quest";
import { type CommandContext, type CommandResult, getCommand, } from "./registry";

let db: Kysely<DB>;

beforeAll(async () => {
  createLogger({ level: "error", },);
  const testDb = await createTestDb();
  db = testDb.db;
  await insertUsers(db, "quest-tester", "Quest Tester", { id: "user-1", password_hash: "hash", } as never,);
  await insertActors(db, "Quest Creator", { id: "creator-1", owner_id: "user-1", } as never,);
},);

/** Ensure a worlds row exists for the given id (FK target for quests). */
const knownWorlds = new Set<string>();
async function ensureWorld(worldId: string,): Promise<void> {
  if (knownWorlds.has(worldId,)) { return; }
  await insertWorlds(db, "user-1", `World ${worldId}`, { id: worldId, } as never,);
  knownWorlds.add(worldId,);
}
/** Resolve the registered /quest handler. */
function questHandler(): (args: string[], ctx: CommandContext,) => Promise<CommandResult> {
  const handler = getCommand("quest",);
  if (!handler) { throw new Error("/quest not registered"); }
  return handler as (args: string[], ctx: CommandContext,) => Promise<CommandResult>;
}

function ctxFor(worldId?: string,): CommandContext {
  return {
    chatId: "chat-1",
    db,
    userId: "creator-1",
    activeChat: { id: "chat-1", worldId, },
  };
}

/** Insert a quest and return its id. */
async function seedQuest(
  worldId: string,
  name: string,
  opts?: {
    description?: string | null;
    status?: QuestStatus;
    progress?: number;
    target?: number;
    priority?: number;
  },
): Promise<string> {
  const id = crypto.randomUUID();
  await ensureWorld(worldId,);
  await insertQuests(db, worldId, "creator-1", name, QuestType.Discovery, opts?.target ?? 1, {
    id,
    description: opts?.description ?? null,
    status: opts?.status ?? QuestStatus.Active,
    progress: opts?.progress ?? 0,
    priority: opts?.priority ?? 50,
    rewards: "[]",
    narrative_hooks: "[]",
    config: "{}",
  } as never,);
  return id;
}

describe("/quest list", () => {
  it("defaults to listing when no subcommand is given", async () => {
    const result = await questHandler()([], ctxFor("empty-world",),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("No active quests in this world.",);
  });

  it("lists only active quests scoped to the chat's world", async () => {
    const worldId = "world-list";
    await seedQuest(worldId, "Find the artifact", {
      description: "Search the crypt for the lost artifact of the ancients.",
      progress: 2,
      target: 5,
      priority: 60,
    },);
    await seedQuest(worldId, "Completed errand", { status: QuestStatus.Completed, },);
    await seedQuest("other-world", "Foreign quest", {},);

    const result = await questHandler()(["list",], ctxFor(worldId,),);
    expect(result.systemMessage,).toContain("**Active Quests (1):**",);
    expect(result.systemMessage,).toContain("- **Find the artifact** (2/5)",);
    expect(result.systemMessage,).toContain("Search the crypt",);
    expect(result.systemMessage,).not.toContain("Completed errand",);
    expect(result.systemMessage,).not.toContain("Foreign quest",);
    expect(result.action,).toBe("list-quests",);
    const payload = result.actionPayload as { quests: { name: string }[] };
    expect(payload.quests,).toHaveLength(1,);
    expect(payload.quests[0]?.name,).toBe("Find the artifact",);
  });

  it("omits the progress suffix for zero-target quests and long descriptions", async () => {
    const worldId = "world-list-2";
    await seedQuest(worldId, "Open-ended vow", {
      description: "d".repeat(180,),
      target: 0,
    },);
    const result = await questHandler()(["list",], ctxFor(worldId,),);
    expect(result.systemMessage,).toContain("- **Open-ended vow**\n",);
    expect(result.systemMessage,).not.toContain("/0)",);
    // Description is truncated to 100 characters.
    expect(result.systemMessage,).toContain("d".repeat(100,),);
    expect(result.systemMessage,).not.toContain("d".repeat(101,),);
  });

  it("falls back to the default world when the chat has none", async () => {
    await seedQuest("world-elsewhere", "Elsewhere quest", {},);
    const result = await questHandler()([], ctxFor(undefined,),);
    expect(result.systemMessage,).toContain("No active quests in this world.",);
  });
});

describe("/quest create", () => {
  it("returns usage when the description is empty", async () => {
    const result = await questHandler()(["create",], ctxFor("w",),);
    expect(result.systemMessage,).toContain("Usage: /quest create <description>",);
    expect(result.action,).toBeUndefined();
  });

  it("creates an active discovery quest in the chat's world", async () => {
    await ensureWorld("world-create",);
    const result = await questHandler()(
      ["create", "Defeat", "the", "dragon"],
      ctxFor("world-create",),
    );
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("**Quest created:** Defeat the dragon",);
    expect(result.action,).toBe("create-quest",);

    const payload = result.actionPayload as { id: string; description: string };
    expect(payload.description,).toBe("Defeat the dragon",);
    const row = await db.selectFrom("quests",).selectAll().where("id", "=", payload.id,).executeTakeFirstOrThrow();
    expect(row.world_id,).toBe("world-create",);
    expect(row.creator_id,).toBe("creator-1",);
    expect(row.name,).toBe("Defeat the dragon",);
    expect(row.status,).toBe(QuestStatus.Active,);
    expect(row.type,).toBe(QuestType.Discovery,);
  });
});

describe("/quest status", () => {
  it("returns usage when no name is given", async () => {
    const result = await questHandler()(["status",], ctxFor("w",),);
    expect(result.systemMessage,).toContain("Usage: /quest status <quest name>",);
  });

  it("reports progress with percentage for a matching quest", async () => {
    const worldId = "world-status";
    await seedQuest(worldId, "Recover the crown", {
      description: "The crown lies in the sunken vault.",
      progress: 2,
      target: 4,
    },);

    const result = await questHandler()(["status", "crown",], ctxFor(worldId,),);
    expect(result.systemMessage,).toContain("**Quest Status:** Recover the crown",);
    expect(result.systemMessage,).toContain("Status: active",);
    expect(result.systemMessage,).toContain("Progress: 2/4 (50%)",);
    expect(result.systemMessage,).toContain("The crown lies in the sunken vault.",);
    expect(result.action,).toBe("quest-status",);
  });

  it("reports a quest with a zero target without a progress line", async () => {
    const worldId = "world-status-2";
    await seedQuest(worldId, "Endless vigil", { target: 0, description: null, },);
    const result = await questHandler()(["status", "vigil",], ctxFor(worldId,),);
    expect(result.systemMessage,).toContain("**Quest Status:** Endless vigil",);
    expect(result.systemMessage,).not.toContain("Progress:",);
    expect(result.systemMessage,).toContain("No description.",);
  });

  it("reports not-found for an unknown quest", async () => {
    const result = await questHandler()(["status", "missing-quest",], ctxFor("world-status",),);
    expect(result.systemMessage,).toBe("Quest not found: missing-quest",);
    expect(result.action,).toBeUndefined();
  });
});

describe("/quest complete", () => {
  it("returns usage when no name is given", async () => {
    const result = await questHandler()(["complete",], ctxFor("w",),);
    expect(result.systemMessage,).toContain("Usage: /quest complete <quest name>",);
  });

  it("marks an active quest completed and persists the transition", async () => {
    const worldId = "world-complete";
    const id = await seedQuest(worldId, "Slay the beast", { progress: 0, target: 1, },);

    const result = await questHandler()(["complete", "beast",], ctxFor(worldId,),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toBe("**Quest completed:** Slay the beast",);
    expect(result.action,).toBe("complete-quest",);
    expect(result.actionPayload,).toEqual({ id, name: "Slay the beast", },);

    const row = await db.selectFrom("quests",).selectAll().where("id", "=", id,).executeTakeFirstOrThrow();
    expect(row.status,).toBe(QuestStatus.Completed,);
    expect(row.completed_at,).not.toBeNull();
  });

  it("reports not-found when no active quest matches", async () => {
    const worldId = "world-complete-2";
    await seedQuest(worldId, "Failed pact", { status: QuestStatus.Failed, },);
    const result = await questHandler()(["complete", "pact",], ctxFor(worldId,),);
    expect(result.systemMessage,).toBe("Active quest not found: pact",);
  });
});

describe("/quest unknown subcommand", () => {
  it("prints the usage block", async () => {
    const result = await questHandler()(["frobnicate",], ctxFor("w",),);
    expect(result.systemMessage,).toContain("Usage: /quest [list|create|status|complete]",);
    expect(result.handled,).toBe(true,);
  });

  it("normalizes subcommand case", async () => {
    const result = await questHandler()(["LIST",], ctxFor("world-normalize",),);
    expect(result.systemMessage,).toContain("**Active Quests",);
  });
});
