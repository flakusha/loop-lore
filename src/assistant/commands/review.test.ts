// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /review command tests — character/world/location completeness review
 * against an in-memory database, including damaged JSON connections.
 */
import { beforeAll, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertLocations, insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
import "./review";
import { type CommandContext, type CommandResult, getCommand, } from "./registry";

let db: Kysely<DB>;

const USER = "review-user";

beforeAll(async () => {
  createLogger({ level: "error", },);
  const testDb = await createTestDb();
  db = testDb.db;
  await insertUsers(db, "review-tester", "Review Tester", { id: USER, password_hash: "hash", } as never,);
},);

/** Resolve the registered /review handler. */
function reviewHandler(): (args: string[], ctx: CommandContext,) => Promise<CommandResult> {
  const handler = getCommand("review",);
  if (!handler) { throw new Error("/review not registered",); }
  return handler as (args: string[], ctx: CommandContext,) => Promise<CommandResult>;
}

function ctxFor(worldId?: string,): CommandContext {
  return {
    chatId: "chat-1",
    db,
    userId: USER,
    activeChat: { id: "chat-1", worldId, },
  };
}

const knownWorlds = new Set<string>();

/** Ensure a worlds row exists (FK target for locations) and return its id. */
async function ensureWorld(worldId: string,): Promise<string> {
  if (knownWorlds.has(worldId,)) { return worldId; }
  await insertWorlds(db, USER, `World ${worldId}`, { id: worldId, } as never,);
  knownWorlds.add(worldId,);
  return worldId;
}

/**
 * Insert an actor owned by the review user and return its id. `createdAt`
 * orders the actor against others: /review picks the most recent one.
 */
async function seedActor(opts?: {
  displayName?: string;
  description?: string | null;
  personality?: string | null;
  scenario?: string | null;
  systemPrompt?: string | null;
  mesExample?: string | null;
  welcomeMessage?: string | null;
  createdAt?: string;
},): Promise<string> {
  const id = crypto.randomUUID();
  await insertActors(db, opts?.displayName ?? "Aria", {
    id,
    user_id: USER,
    description: opts?.description ?? null,
    personality: opts?.personality ?? null,
    scenario: opts?.scenario ?? null,
    system_prompt: opts?.systemPrompt ?? null,
    mes_example: opts?.mesExample ?? null,
    welcome_message: opts?.welcomeMessage ?? null,
    created_at: opts?.createdAt,
  } as never,);
  return id;
}

/** Insert one or more locations in a (fresh) world. */
async function seedLocation(
  worldId: string,
  opts?: { name?: string; description?: string | null; connections?: string; count?: number },
): Promise<void> {
  await ensureWorld(worldId,);
  const count = opts?.count ?? 1;
  for (let i = 0; i < count; i++) {
    await insertLocations(db, worldId, opts?.name ?? `Loc ${worldId} ${i}`, {
      description: opts?.description ?? null,
      connections: opts?.connections,
    } as never,);
  }
}

describe("/review character", () => {
  it("reports a missing actor", async () => {
    const result = await reviewHandler()(["character",], ctxFor(),);
    expect(result.systemMessage,).toContain("No character found to review",);
    expect(result.action,).toBeUndefined();
  });

  it("supports the char alias", async () => {
    const result = await reviewHandler()(["char",], ctxFor(),);
    expect(result.systemMessage,).toContain("No character found to review",);
  });

  it("celebrates a fully specified character", async () => {
    await seedActor({
      displayName: "Aria",
      description: "A weathered ranger who walks the borderlands alone.",
      personality: "Stoic, loyal, haunted.",
      scenario: "The caravan route at dusk.",
      systemPrompt: "Stay in character.",
      mesExample: "{{user}}: hi\n{{char}}: hello",
      welcomeMessage: "Welcome, traveler.",
      createdAt: "2026-01-01T00:00:00.000Z",
    },);
    const result = await reviewHandler()([], ctxFor(),);
    expect(result.systemMessage,).toContain("**Character Review: Aria**",);
    expect(result.systemMessage,).toContain("well-defined",);
    expect(result.action,).toBe("review-entity",);
    const payload = result.actionPayload as { target: string; issues: unknown[] };
    expect(payload.target,).toBe("character",);
    expect(payload.issues,).toHaveLength(0,);
  });

  it("categorizes missing fields into warnings and suggestions", async () => {
    await seedActor({
      displayName: "A",
      description: "too brief",
      createdAt: "2026-01-02T00:00:00.000Z",
    },);
    const result = await reviewHandler()(["character",], ctxFor(),);
    expect(result.systemMessage,).toContain("**Warnings (3):**",);
    expect(result.systemMessage,).toContain("⚠️ personality: Missing personality traits",);
    expect(result.systemMessage,).toContain("⚠️ display_name: Name too short",);
    expect(result.systemMessage,).toContain("**Suggestions (4):**",);
    expect(result.systemMessage,).toContain("💡 mes_example: No example messages",);
    expect(result.systemMessage,).toContain("💡 description: Description is very brief",);
    expect(result.systemMessage,).toContain("**Summary:** 0 errors, 3 warnings, 4 suggestions",);
    const payload = result.actionPayload as { issues: { severity: string }[] };
    expect(payload.issues,).toHaveLength(7,);
  });
});

describe("/review world", () => {
  it("reports a missing world", async () => {
    const result = await reviewHandler()(["world",], ctxFor("no-such-world",),);
    expect(result.systemMessage,).toContain("No world found",);
  });

  it("flags missing description, lore and locations", async () => {
    await ensureWorld("bare-world",);
    const result = await reviewHandler()(["world",], ctxFor("bare-world",),);
    expect(result.systemMessage,).toContain("**World Review: World bare-world**",);
    expect(result.systemMessage,).toContain("❌ description: Missing world description",);
    expect(result.systemMessage,).toContain("⚠️ lore: Missing lore/backstory",);
    expect(result.systemMessage,).toContain("⚠️ locations: No locations defined",);
    expect(result.systemMessage,).toContain("**Summary:** 1 errors, 2 warnings, 0 suggestions",);
  });

  it("suggests for a brief description and sparse locations", async () => {
    await ensureWorld("thin-world",);
    await db.updateTable("worlds",).set({ description: "short", },).where("id", "=", "thin-world",).execute();
    await seedLocation("thin-world", { count: 2, },);
    const result = await reviewHandler()(["world",], ctxFor("thin-world",),);
    expect(result.systemMessage,).toContain("💡 description: Description is brief",);
    expect(result.systemMessage,).toContain("💡 locations: Only 2 location(s) defined",);
    expect(result.systemMessage,).toContain("**Summary:** 0 errors, 1 warnings, 2 suggestions",);
  });

  it("celebrates a richly specified world", async () => {
    await ensureWorld("rich-world",);
    await db.updateTable("worlds",).set({
      description: "x".repeat(120,),
      lore: "An ancient history of fallen empires.",
    },).where("id", "=", "rich-world",).execute();
    await seedLocation("rich-world", { count: 3, },);
    const result = await reviewHandler()(["world",], ctxFor("rich-world",),);
    expect(result.systemMessage,).toContain("well-defined",);
    expect(result.systemMessage,).not.toContain("Summary:",);
  });
});

describe("/review location", () => {
  it("reports a missing location", async () => {
    await ensureWorld("loc-less-world",);
    const result = await reviewHandler()(["location",], ctxFor("loc-less-world",),);
    expect(result.systemMessage,).toContain("No location found",);
  });

  it("supports the loc alias", async () => {
    await ensureWorld("loc-less-world-2",);
    const result = await reviewHandler()(["loc",], ctxFor("loc-less-world-2",),);
    expect(result.systemMessage,).toContain("No location found",);
  });

  it("flags missing description and missing connections", async () => {
    await seedLocation("loc-bare", { name: "Sunken Vault", description: null, connections: "[]", },);
    const result = await reviewHandler()(["location",], ctxFor("loc-bare",),);
    expect(result.systemMessage,).toContain("**Location Review: Sunken Vault**",);
    expect(result.systemMessage,).toContain("❌ description: Missing location description",);
    expect(result.systemMessage,).toContain("⚠️ connections: No connections to other locations",);
    expect(result.systemMessage,).toContain("**Summary:** 1 errors, 1 warnings, 0 suggestions",);
  });

  it("treats malformed connections JSON as no connections", async () => {
    await seedLocation("loc-damaged", {
      name: "Broken Bridge",
      description: "A bridge of ropestone over the misty gorge, and then some more words to pass fifty characters.",
      connections: "{not valid json,,",
    },);
    const result = await reviewHandler()(["location",], ctxFor("loc-damaged",),);
    expect(result.systemMessage,).toContain("⚠️ connections: No connections to other locations",);
    expect(result.systemMessage,).not.toContain("Missing location description",);
  });

  it("skips connection warning when links exist and suggests on brief description", async () => {
    await seedLocation("loc-linked", {
      name: "Market Row",
      description: "too short",
      connections: JSON.stringify(["loc-bare", "loc-damaged",],),
    },);
    const result = await reviewHandler()(["location",], ctxFor("loc-linked",),);
    expect(result.systemMessage,).toContain("💡 description: Description is brief",);
    expect(result.systemMessage,).not.toContain("connections:",);
    expect(result.action,).toBe("review-entity",);
    const payload = result.actionPayload as { target: string };
    expect(payload.target,).toBe("location",);
  });
});

describe("/review unknown target", () => {
  it("prints usage", async () => {
    const result = await reviewHandler()(["nation",], ctxFor(),);
    expect(result.systemMessage,).toBe("Usage: /review <character|world|location>",);
    expect(result.handled,).toBe(true,);
  });
});
