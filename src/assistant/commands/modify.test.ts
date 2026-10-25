// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for `/modify` — the LLM-assisted modification command.
 *
 * The completion is injected through the exported `runModifyGeneration` seam
 * (the same seam `/create` uses), so no provider is resolved here. The
 * command must never persist anything: it returns a preview action that the
 * frontend confirms before the real route is called.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import type { GenerateRequest, } from "../../generation/providers/types";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertLocations,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { runModifyGeneration, } from "./modify";
import type { CommandContext, } from "./registry";

describe("/modify", () => {
  let db: Kysely<DB>;
  let ownerId: string;
  let otherId: string;
  let worldId: string;
  let actorId: string;

  const ctx = (overrides?: Partial<CommandContext>,): CommandContext => ({
    chatId: "chat-1",
    db,
    userId: ownerId,
    activeChat: { id: "chat-1", worldId, },
    ...overrides,
  });

  /**
   * A completion stub answering with the given entity JSON.
   * @param entity - the entity the "model" returns
   */
  const modelSays = (
    entity: Record<string, unknown>,
  ): (req: GenerateRequest,) => Promise<{ content: string }> =>
  async () => ({
    content: JSON.stringify(entity,),
  });

  beforeAll(async () => {
    ({ db, } = await createTestDb());
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  beforeEach(async () => {
    for (const table of ["actors", "locations", "worlds", "users",] as const) {
      await db.deleteFrom(table,).execute();
    }

    ownerId = `user-${crypto.randomUUID()}`;
    otherId = `user-${crypto.randomUUID()}`;
    await insertUsers(db, `owner-${ownerId}`, "Owner", { id: ownerId, },);
    await insertUsers(db, `other-${otherId}`, "Other", { id: otherId, },);
    worldId = await insertWorlds(db, ownerId, "Emberfall", {},);
    actorId = await insertActors(db, "Rin", {
      id: "actor-rin",
      owner_id: ownerId,
      user_id: ownerId,
      description: "A ranger",
      personality: "wry",
      appearance: "tall",
      row_version: 4,
    },);
  },);

  test("previews the model-authored fields without persisting them", async () => {
    const result = await runModifyGeneration(
      ["character", actorId, "make", "her", "more", "mysterious",],
      ctx(),
      modelSays({
        name: "Rin",
        description: "A ranger who keeps her secrets",
        personality: "wry, secretive",
      },),
    );

    expect(result.action,).toBe("modify-entity",);
    const payload = result.actionPayload ?? {};
    expect(payload.kind,).toBe("character",);
    expect(payload.entityId,).toBe(actorId,);
    expect(payload.updates,).toEqual({
      description: "A ranger who keeps her secrets",
      personality: "wry, secretive",
    },);

    expect(payload.contentVersion,).toBe(4,);
    expect(result.systemMessage,).toContain("**Modification preview**",);

    // The command is preview-only: the row is untouched until the confirmed
    // frontend handler calls the real route.
    const row = await db.selectFrom("actors",).select(["description", "personality",],)
      .where("id", "=", actorId,).executeTakeFirstOrThrow();

    expect(row.description,).toBe("A ranger",);
    expect(row.personality,).toBe("wry",);
  });

  test("sends the current entity and the request to the model", async () => {
    let prompt = "";
    await runModifyGeneration(["character", actorId, "make her mysterious",], ctx(), async (req,) => {
      prompt = req.messages[1]?.content ?? "";
      return { content: JSON.stringify({ name: "Rin", description: "d", personality: "p", },), };
    },);

    expect(prompt,).toContain("Rin",);
    expect(prompt,).toContain("A ranger",);
    expect(prompt,).toContain("make her mysterious",);
  });

  test("refuses a character the caller does not own", async () => {
    const result = await runModifyGeneration(
      ["character", actorId, "change her",],
      ctx({ userId: otherId, },),
      modelSays({ name: "Rin", description: "d", personality: "p", },),
    );

    expect(result.action,).toBeUndefined();
    expect(result.systemMessage,).toContain("not found or not owned by you",);
  });

  test("rejects a model answer that is not JSON", async () => {
    const result = await runModifyGeneration(
      ["character", actorId, "change her",],
      ctx(),
      async () => ({ content: "sorry, I cannot help with that", }),
    );

    expect(result.action,).toBeUndefined();
    expect(result.systemMessage,).toContain("Failed to parse",);
  });

  test("hard-rejects a proposal that fails the schema gate", async () => {
    // The stored character has no personality and the model omits it, so the
    // character schema gate (REQUIRED_FIELDS) rejects the whole modification.
    await db.updateTable("actors",).set({ personality: null, },)
      .where("id", "=", actorId,).execute();

    const result = await runModifyGeneration(
      ["character", actorId, "change her",],
      ctx(),
      modelSays({ name: "Rin", description: "A ranger", appearance: "tall", },),
    );

    expect(result.action,).toBeUndefined();
    expect(result.systemMessage,).toContain("**Modification rejected — invalid character data:**",);
    expect(result.systemMessage,).toContain("personality",);
  });

  test("warns when the new name collides with another entity of the same owner", async () => {
    await insertActors(db, "Rook", {
      id: "actor-rook",
      owner_id: ownerId,
      user_id: ownerId,
      description: "A smuggler",
      personality: "sly",
      appearance: "lean",
    },);

    const result = await runModifyGeneration(
      ["character", actorId, "rename her",],
      ctx(),
      modelSays({
        name: "Rook",
        description: "A ranger who keeps her secrets",
        personality: "wry",
      },),
    );

    // The duplicate gate is advisory: the preview is still offered, but the
    // user is told about the collision.
    expect(result.action,).toBe("modify-entity",);
    expect(result.systemMessage,).toContain("already exists in this scope",);
  });

  test("reports no changes when the model echoes the current values", async () => {
    const result = await runModifyGeneration(
      ["character", actorId, "polish her",],
      ctx(),
      modelSays({ name: "Rin", description: "A ranger", personality: "wry", appearance: "tall", },),
    );

    expect(result.action,).toBeUndefined();
    expect(result.systemMessage,).toContain("**No changes proposed**",);
    // The entity being modified must not be reported as its own duplicate.
    expect(result.systemMessage,).not.toContain("already exists in this scope",);
  });

  test("previews a location modification inside the caller's world", async () => {
    const gate = await insertLocations(db, worldId, "Ash Gate", {
      description: "A gate of black iron.",
    },);

    const result = await runModifyGeneration(
      ["location", gate, "make it gloomier",],
      ctx(),
      modelSays({ name: "Gloomy Gate", description: "A gate that swallows the light", },),
    );

    expect(result.action,).toBe("modify-entity",);
    const payload = result.actionPayload ?? {};
    expect(payload.worldId,).toBe(worldId,);
    expect(payload.updates,).toEqual({
      name: "Gloomy Gate",
      description: "A gate that swallows the light",
    },);
  });

  test("rejects an unknown kind and a missing request", async () => {
    const unknown = await runModifyGeneration(
      ["dragon", actorId, "change her",],
      ctx(),
      modelSays({},),
    );

    expect(unknown.systemMessage,).toContain("Unknown entity kind",);

    const usage = await runModifyGeneration(["character", actorId,], ctx(), modelSays({},),);
    expect(usage.systemMessage,).toContain("Usage: /modify",);
  });
});
