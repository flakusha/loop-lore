// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Focused tests for untested branches in PersonasService.
 *
 * Coverage gaps identified against service.boundary.test.ts, service.edge.test.ts,
 * and service.test.ts:
 *   - convertToCharacter() success + not-found paths
 *   - update() with avatarAssetId, title, isDefault(true/false) branches
 *   - delete() clearing chat_participants.persona_id cascade
 *   - getDefault() when a default persona exists
 *   - create() with avatarAssetId field
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { DefaultState, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { PersonasService, } from "./service";

let db: Kysely<DB>;
let service: PersonasService;
const userId = "missing-test-user";

beforeAll(async () => {
  createLogger({ level: "error", },);
  ({ db, } = await createTestDb());

  await db
    .insertInto("users",)
    .values({
      id: userId,
      username: "missinguser",
      display_name: "Missing User",
      password_hash: "hash",
      role: "solo",
      status: "active",
      settings: "{}",
    },)
    .execute();

  // Create a valid asset for avatarAssetId tests
  await db
    .insertInto("assets",)
    .values({
      id: "test-asset-1",
      owner_id: userId,
      filename: "test.png",
      mime_type: "image/png",
      asset_type: "image",
      size_bytes: 1024,
      storage_path: "/tmp/test.png",
      storage_backend: "local",
      visibility: "private",
    },)
    .execute();

  service = new PersonasService(db,);
},);

afterAll(() => {
  db.destroy();
},);

describe("PersonasService — convertToCharacter()", () => {
  test("creates an actor from persona with correct fields", async () => {
    const personaId = await service.create({
      userId,
      name: "Sir Galahad",
      description: "A brave knight of the Round Table",
      title: "Knight Champion",
    },);

    const result = await service.convertToCharacter(personaId, userId,);

    expect(result.actorId,).toBeTruthy();
    expect(typeof result.actorId,).toBe("string",);

    // Verify the actor was inserted with correct fields
    const actor = await db
      .selectFrom("actors",)
      .selectAll()
      .where("id", "=", result.actorId,)
      .executeTakeFirst();

    expect(actor,).toBeTruthy();
    expect(actor!.display_name,).toBe("Sir Galahad",);
    expect(actor!.description,).toBe("A brave knight of the Round Table",);
    expect(actor!.actor_type,).toBe("character",);
    expect(actor!.user_id,).toBeNull();
    expect(actor!.owner_id,).toBe(userId,);
    expect(actor!.system_prompt,).toBeNull();
    expect(actor!.agent_type,).toBe("ai",);
    expect(actor!.settings,).toBe("{}",);
    expect(actor!.format_version,).toBe(0,);
    expect(actor!.import_spec,).toBe("raw",);
    expect(actor!.data_source_format,).toBe("json",);
    expect(actor!.data_raw,).toBeNull();
  });

  test("maps avatar_asset_id from persona to actor", async () => {
    const avatarId = "test-asset-1";
    const personaId = await service.create({
      userId,
      name: "Avatar Persona",
      avatarAssetId: avatarId,
    },);

    const result = await service.convertToCharacter(personaId, userId,);

    const actor = await db
      .selectFrom("actors",)
      .selectAll()
      .where("id", "=", result.actorId,)
      .executeTakeFirst();

    expect(actor!.avatar_asset_id,).toBe(avatarId,);
  });

  test("throws when persona not found", async () => {
    await expect(service.convertToCharacter("nonexistent-id", userId,),).rejects.toThrow(
      "Persona not found",
    );
  });

  test("throws when persona belongs to different user", async () => {
    const personaId = await service.create({ userId, name: "Private Persona", },);

    await expect(
      service.convertToCharacter(personaId, "other-user-id",),
    ).rejects.toThrow("Persona not found",);
  });
});

describe("PersonasService — update() individual field branches", () => {
  test("updates avatarAssetId with existing asset reference", async () => {
    const id = await service.create({ userId, name: "Avatar Test", },);
    await service.update(id, { avatarAssetId: "test-asset-1", }, userId,);
    const persona = await service.getById(id, userId,);
    expect(persona!.avatar_asset_id,).toBe("test-asset-1",);
  });

  test("updates title", async () => {
    const id = await service.create({ userId, name: "Title Test", },);
    await service.update(id, { title: "Supreme Overlord", }, userId,);
    const persona = await service.getById(id, userId,);
    expect(persona!.title,).toBe("Supreme Overlord",);
  });

  test("isDefault=true sets is_default to DefaultState.Default", async () => {
    const id = await service.create({ userId, name: "Default Toggle Test", },);
    await service.update(id, { isDefault: true, }, userId,);
    const persona = await service.getById(id, userId,);
    expect(persona!.is_default,).toBe(DefaultState.Default,);
  });

  test("isDefault=false sets is_default to DefaultState.NotDefault", async () => {
    const id = await service.create({
      userId,
      name: "Not Default Test",
    },);

    // Manually set to default first via setDefault to ensure we have a default
    await service.setDefault(id, userId,);

    // Create another persona and make it the default
    const id2 = await service.create({ userId, name: "New Default", },);
    await service.setDefault(id2, userId,);

    // Now explicitly set isDefault=false on the original
    await service.update(id, { isDefault: false, }, userId,);
    const persona = await service.getById(id, userId,);
    expect(persona!.is_default,).toBe(DefaultState.NotDefault,);
  });

  test("isDefault=false does not affect other fields", async () => {
    const id = await service.create({
      userId,
      name: "Side Effects Test",
      description: "Original description",
    },);

    await service.update(id, { isDefault: false, }, userId,);
    const persona = await service.getById(id, userId,);
    expect(persona!.name,).toBe("Side Effects Test",);
    expect(persona!.description,).toBe("Original description",);
  });
});

describe("PersonasService — delete() cascade", () => {
  test("clears persona_id from chat_participants when deleting persona", async () => {
    const personaId = await service.create({ userId, name: "Chat Participant Test", },);

    // Create a chat and add the persona as a participant
    const chatId = "chat-for-delete-cascade";
    await db
      .insertInto("chats",)
      .values({
        id: chatId,
        created_by: userId,
        name: "Delete Cascade Chat",
        type: "direct",
        mode: "direct",
      },)
      .execute();

    await db
      .insertInto("chat_participants",)
      .values({
        chat_id: chatId,
        actor_id: userId,
        persona_id: personaId,
        role_in_chat: "member",
      },)
      .execute();

    // Verify participant has persona_id set
    const before = await db
      .selectFrom("chat_participants",)
      .selectAll()
      .where("chat_id", "=", chatId,)
      .where("actor_id", "=", userId,)
      .executeTakeFirst();
    expect(before!.persona_id,).toBe(personaId,);

    // Delete the persona
    await service.delete(personaId, userId,);

    // Verify persona_id is cleared
    const after = await db
      .selectFrom("chat_participants",)
      .selectAll()
      .where("chat_id", "=", chatId,)
      .where("actor_id", "=", userId,)
      .executeTakeFirst();
    expect(after!.persona_id,).toBeNull();
  });
});

describe("PersonasService — getDefault()", () => {
  test("returns the default persona when one is set", async () => {
    const freshUser = "getdefault-test-user";
    await db
      .insertInto("users",)
      .values({
        id: freshUser,
        username: "getdefaultuser",
        display_name: "Get Default User",
        password_hash: "hash",
        role: "solo",
        status: "active",
        settings: "{}",
      },)
      .execute();

    const defaultId = await service.create({ userId: freshUser, name: "Default Persona", },);
    await service.create({ userId: freshUser, name: "Other Persona", },);

    await service.setDefault(defaultId, freshUser,);

    const def = await service.getDefault(freshUser,);
    expect(def,).toBeTruthy();
    expect(def!.id,).toBe(defaultId,);
    expect(def!.name,).toBe("Default Persona",);
  });
});

describe("PersonasService — create() with avatarAssetId", () => {
  test("creates persona with avatarAssetId referencing valid asset", async () => {
    const id = await service.create({
      userId,
      name: "Avatar Creator",
      avatarAssetId: "test-asset-1",
    },);
    const persona = await service.getById(id, userId,);
    expect(persona,).toBeTruthy();
    expect(persona!.avatar_asset_id,).toBe("test-asset-1",);
  });

  test("creates persona with null avatarAssetId", async () => {
    const id = await service.create({
      userId,
      name: "Null Avatar",
      avatarAssetId: null,
    },);
    const persona = await service.getById(id, userId,);
    expect(persona!.avatar_asset_id,).toBeNull();
  });
});
