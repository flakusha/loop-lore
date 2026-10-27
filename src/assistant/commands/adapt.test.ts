// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for `/adapt` and the adaptation quality module: the pure gates
 * (field vocabulary, prompt, parser/validator, merge) plus the command flow
 * with an injectable stub completion — preview action, quality-gate rejects,
 * target-world checks, and ownership denials.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertUsers,
  insertWorldLoreEntries,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import {
  ADAPTABLE_FIELDS,
  applyAdaptationChanges,
  buildAdaptationPrompt,
  parseAdaptationChanges,
} from "../quality/adaptation";
import type { CommandContext, CommandHandler, } from "./registry";
import { getCommand, } from "./registry";

// Side-effect + named import: the handler registers itself; the exported
// core is the test seam (no dynamic import needed).
import { runAdaptation, } from "./adapt";

function mustGet(name: string,): CommandHandler {
  const handler = getCommand(name,);
  if (!handler) { throw new Error(`command not registered: ${name}`,); }
  return handler;
}

const adapt = mustGet("adapt",);
const NO_PROVIDER_CONFIG = {
  generation: { defaultProvider: "mock", defaultModels: { mock: "m", }, modelRoles: {}, },
} as unknown as Config;

const completeOk = async () => ({
  content: JSON.stringify({
    changes: [
      { field: "appearance", newValue: "neon-lined jacket", reason: "cyberpunk couture", },
      { field: "scenario", newValue: "A tide-gate runner from the Sprawl.", reason: "explains the move", },
    ],
  },),
});

describe("adaptation quality module", () => {
  test("adaptable fields cover the create-route field names", () => {
    expect(ADAPTABLE_FIELDS.character,).toContain("appearance",);
    expect(ADAPTABLE_FIELDS.location,).toEqual(["description", "kind",],);
    expect(ADAPTABLE_FIELDS.item,).toContain("rarity",);
  });

  test("prompt embeds the target world, requested fields, and JSON contract", () => {
    const prompt = buildAdaptationPrompt({
      kind: "item",
      sourceName: "Charm",
      sourceFields: { name: "Charm", description: "tide-worn", rarity: "common", },
      adaptFields: ["rarity",],
      targetWorldName: "Sprawl",
      targetWorldContext: "Neon megacity.",
    },);

    expect(prompt,).toContain("Target world: Sprawl",);
    expect(prompt,).toContain("Neon megacity.",);
    expect(prompt,).toContain('rarity: "common"',);
    expect(prompt,).toContain('"changes"',);
  });

  test("parse validates fields, values, and requested restriction", () => {
    const ok = parseAdaptationChanges(
      '{"changes":[{"field":"rarity","newValue":"legendary","reason":"economy"}]}',
      "item",
      ["rarity",],
    );

    expect(ok.ok,).toBe(true,);

    const badField = parseAdaptationChanges(
      '{"changes":[{"field":"weight","newValue":"3"}]}',
      "item",
      [],
    );

    expect(badField.ok,).toBe(false,);

    const outOfSet = parseAdaptationChanges(
      '{"changes":[{"field":"description","newValue":"x"}]}',
      "item",
      ["rarity",],
    );

    expect(outOfSet.ok,).toBe(false,);

    const empty = parseAdaptationChanges('{"changes":[]}', "item", [],);
    expect(empty.ok,).toBe(false,);
  });

  test("merge applies changes over the source fields", () => {
    const merged = applyAdaptationChanges(
      { name: "Charm", description: "tide-worn", rarity: "common", },
      [{ field: "rarity", oldValue: "common", newValue: "legendary", reason: "r", },],
    );

    expect(merged,).toEqual({ name: "Charm", description: "tide-worn", rarity: "legendary", },);
  });
});

describe("/adapt argument validation (runAdaptation core)", () => {
  let db: Kysely<DB>;
  let ownerId: string;
  let otherId: string;
  let sourceWorldId: string;
  let targetWorldId: string;
  let actorId: string;

  const ownerCtx = (userId = ownerId,): CommandContext => ({
    chatId: "chat-1",
    db,
    config: NO_PROVIDER_CONFIG,
    userId,
    activeChat: { id: "chat-1", worldId: sourceWorldId, },
  });

  beforeAll(async () => {
    ({ db, } = await createTestDb());
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  beforeEach(async () => {
    for (const table of ["world_lore_entries", "items", "actors", "worlds", "users",] as const) {
      await db.deleteFrom(table,).execute();
    }

    ownerId = `user-${crypto.randomUUID()}`;
    otherId = `user-${crypto.randomUUID()}`;
    await insertUsers(db, `owner-${ownerId}`, "Owner", { id: ownerId, },);
    await insertUsers(db, `other-${otherId}`, "Other", { id: otherId, },);

    sourceWorldId = await insertWorlds(db, ownerId, "Medieval", { description: "Knights and castles.", },);
    targetWorldId = await insertWorlds(db, ownerId, "Cyberpunk", { description: "Neon megacity.", },);
    await insertWorldLoreEntries(db, targetWorldId, "The Sprawl never sleeps.", { name: "Sprawl Lore", },);

    actorId = `actor-${crypto.randomUUID()}`;
    await db
      .insertInto("actors",)
      .values({
        id: actorId,
        actor_type: "character",
        display_name: "Iria",
        owner_id: ownerId,
        agent_type: "none",
        settings: "{}",
        row_version: 0,
        visibility: "private",
        import_spec: "{}",
        description: "A medieval guard.",
        appearance: "Chainmail armor",
        personality: "Steadfast",
        scenario: "Guards the tide gate.",
      },)
      .execute();
  },);

  test("usage message without kind and id", async () => {
    const res = await runAdaptation([], ownerCtx(), async () => ({ content: "{}", }),);
    expect(res.systemMessage,).toContain("Usage",);
  });

  test("rejects a missing --to target", async () => {
    const res = await runAdaptation(["character", actorId,], ownerCtx(), async () => ({ content: "{}", }),);
    expect(res.systemMessage,).toContain("--to",);
  });

  test("rejects unknown or non-adaptable fields", async () => {
    const res = await runAdaptation(
      ["character", actorId, "--to", targetWorldId, "--fields", "outfit,deck",],
      ownerCtx(),
      async () => ({ content: "{}", }),
    );

    expect(res.systemMessage,).toContain("cannot adapt",);
  });

  test("rejects an unknown target world", async () => {
    const res = await runAdaptation(
      ["character", actorId, "--to", "world-missing",],
      ownerCtx(),
      async () => ({ content: "{}", }),
    );

    expect(res.systemMessage,).toContain("not found",);
  });

  test("denies a non-owned source", async () => {
    const res = await runAdaptation(
      ["character", actorId, "--to", targetWorldId,],
      ownerCtx(otherId,),
      async () => ({ content: "{}", }),
    );

    expect(res.systemMessage,).toContain("not found or not owned by you",);
  });

  test("registered handler fails soft without a provider", async () => {
    const res = await adapt(
      ["character", actorId, "--to", targetWorldId, "--fields", "appearance,scenario",],
      ownerCtx(),
    );

    expect(res.handled,).toBe(true,);
    expect(res.systemMessage,).toContain("provider is unavailable",);
  });

  test("core runAdaptation previews changes from the injected completion", async () => {
    const res = await runAdaptation(
      ["character", actorId, "--to", targetWorldId, "--fields", "appearance,scenario",],
      ownerCtx(),
      completeOk,
      "test-model",
    );

    expect(res.handled,).toBe(true,);
    expect(res.action,).toBe("adapt-entity",);
    expect(res.actionPayload?.targetWorldId,).toBe(targetWorldId,);
    expect(res.actionPayload?.sourceName,).toBe("Iria",);
    const fields = res.actionPayload?.fields as Record<string, unknown>;
    expect(fields.appearance,).toBe("neon-lined jacket",);
    expect(fields.description,).toBe("A medieval guard.",);
    expect(res.systemMessage,).toContain("neon-lined jacket",);
    expect(res.systemMessage,).toContain("cyberpunk couture",);
  });

  test("core runAdaptation rejects when the completion is unusable", async () => {
    const res = await runAdaptation(
      ["character", actorId, "--to", targetWorldId,],
      ownerCtx(),
      async () => ({ content: "prose, not json", }),
    );

    expect(res.systemMessage,).toContain("Adaptation rejected",);
    expect(res.action,).toBeUndefined();
  });

  test("core runAdaptation refuses same-world adaptation for world entities", async () => {
    const itemId = `item-${crypto.randomUUID()}`;
    await db
      .insertInto("items",)
      .values({ id: itemId, world_id: sourceWorldId, name: "Tide Charm", category: "armor", rarity: "common", },)
      .execute();

    const res = await runAdaptation(
      ["item", itemId, "--to", sourceWorldId,],
      ownerCtx(),
      completeOk,
    );

    expect(res.systemMessage,).toContain("already lives in the target world",);
  });

  test("core runAdaptation fails soft when the completion throws", async () => {
    const res = await runAdaptation(
      ["character", actorId, "--to", targetWorldId,],
      ownerCtx(),
      async () => {
        throw new Error("provider down",);
      },
    );

    expect(res.systemMessage,).toContain("provider is unavailable",);
  });
});
