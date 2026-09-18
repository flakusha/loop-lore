import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { PersonasService, } from "./service";

let db: Kysely<DB>;
let service: PersonasService;
const userId = "test-user-1";

beforeAll(async () => {
  createLogger({ level: "error", },);
  ({ db, } = await createTestDb());

  await db
    .insertInto("users",)
    .values({
      id: userId,
      username: "testuser",
      display_name: "Test User",
      password_hash: "hash",
      role: "solo",
      status: "active",
      settings: "{}",
    },)
    .execute();

  service = new PersonasService(db,);
},);

afterAll(() => {
  db.destroy();
},);

describe("PersonasService", () => {
  describe("create()", () => {
    test("creates a persona and returns ID", async () => {
      const id = await service.create({ userId, name: "Hero", },);
      expect(id,).toBeTruthy();
      expect(typeof id,).toBe("string",);
    });

    test("creates persona with optional fields", async () => {
      const id = await service.create({
        userId,
        name: "Villain",
        description: "Bad guy",
        title: "Dark Lord",
      },);
      const persona = await service.getById(id, userId,);
      expect(persona,).toBeTruthy();
      expect(persona!.name,).toBe("Villain",);
      expect(persona!.description,).toBe("Bad guy",);
      expect(persona!.title,).toBe("Dark Lord",);
    });
  });

  describe("listByUser()", () => {
    test("lists personas for a user", async () => {
      const list = await service.listByUser(userId,);
      expect(list.length,).toBeGreaterThanOrEqual(2,);
    });

    test("returns empty for user with no personas", async () => {
      const list = await service.listByUser("nonexistent-user",);
      expect(list,).toEqual([],);
    });
  });

  describe("getById()", () => {
    test("retrieves persona by ID", async () => {
      const id = await service.create({ userId, name: "Get Me", },);
      const persona = await service.getById(id, userId,);
      expect(persona,).toBeTruthy();
      expect(persona!.name,).toBe("Get Me",);
    });

    test("returns undefined for nonexistent ID", async () => {
      const persona = await service.getById("nonexistent", userId,);
      expect(persona,).toBeUndefined();
    });

    test("returns undefined for wrong user", async () => {
      const id = await service.create({ userId, name: "My Persona", },);
      const persona = await service.getById(id, "other-user",);
      expect(persona,).toBeUndefined();
    });
  });

  describe("update()", () => {
    test("updates persona fields", async () => {
      const id = await service.create({ userId, name: "Old Name", },);
      await service.update(id, { name: "New Name", description: "Updated", }, userId,);
      const persona = await service.getById(id, userId,);
      expect(persona!.name,).toBe("New Name",);
      expect(persona!.description,).toBe("Updated",);
    });
  });

  describe("delete()", () => {
    test("deletes a persona", async () => {
      const id = await service.create({ userId, name: "Delete Me", },);
      await service.delete(id, userId,);
      const persona = await service.getById(id, userId,);
      expect(persona,).toBeUndefined();
    });
  });

  describe("update() isDefault", () => {
    test("update isDefault=true unsets the previous default (TASK-persona-setdefault-getdefault-unwired)", async () => {
      const id1 = await service.create({ userId, name: "Old Default", },);
      const id2 = await service.create({ userId, name: "New Default", },);
      await service.setDefault(id1, userId,);

      // The frontend path: PATCH with isDefault=true must not produce two
      // defaults (previously it set the flag without clearing id1's).
      await service.update(id2, { isDefault: true, }, userId,);

      const defaults = await db
        .selectFrom("personas",)
        .select("id",)
        .where("user_id", "=", userId,)
        .where("is_default", "=", "default",)
        .execute();
      expect(defaults,).toHaveLength(1,);
      expect(defaults[0]!.id,).toBe(id2,);
    });
  });

  describe("setDefault()", () => {
    test("throws Persona not found for a missing or foreign persona", async () => {
      await expect(service.setDefault("no-such-id", userId,),).rejects.toThrow("Persona not found",);
    });

    test("sets a persona as default", async () => {
      const id = await service.create({ userId, name: "Default One", },);
      await service.setDefault(id, userId,);
      const def = await db
        .selectFrom("personas",)
        .selectAll()
        .where("user_id", "=", userId,)
        .where("is_default", "=", "default",)
        .executeTakeFirst();
      expect(def,).toBeTruthy();
      expect(def!.id,).toBe(id,);
    });

    test("unsets previous default when setting new one", async () => {
      const id1 = await service.create({ userId, name: "First Default", },);
      const id2 = await service.create({ userId, name: "Second Default", },);

      await service.setDefault(id1, userId,);
      await service.setDefault(id2, userId,);

      const def = await db
        .selectFrom("personas",)
        .selectAll()
        .where("user_id", "=", userId,)
        .where("is_default", "=", "default",)
        .executeTakeFirst();
      expect(def!.id,).toBe(id2,);
    });
  });

  describe("tuning fields", () => {
    test("creates persona with tuning fields", async () => {
      const id = await service.create({
        userId,
        name: "Tuned Persona",
        temperature: 0.8,
        maxTokens: 4000,
        model: "gpt-4o",
      },);
      const persona = await service.getById(id, userId,);
      expect(persona,).toBeTruthy();
      expect(persona!.temperature!,).toBeCloseTo(0.8,);
      expect(persona!.max_tokens,).toBe(4000,);
      expect(persona!.model,).toBe("gpt-4o",);
    });

    test("updates tuning fields", async () => {
      const id = await service.create({ userId, name: "Tune Me", },);
      await service.update(id, {
        temperature: 1.2,
        maxTokens: 8000,
        model: "claude-3",
      }, userId,);
      const persona = await service.getById(id, userId,);
      expect(persona!.temperature!,).toBeCloseTo(1.2,);
      expect(persona!.max_tokens,).toBe(8000,);
      expect(persona!.model,).toBe("claude-3",);
    });

    test("clears tuning fields to null", async () => {
      const id = await service.create({
        userId,
        name: "Clear Me",
        temperature: 0.5,
        maxTokens: 2000,
        model: "llama",
      },);
      await service.update(id, {
        temperature: null,
        maxTokens: null,
        model: null,
      }, userId,);
      const persona = await service.getById(id, userId,);
      expect(persona!.temperature,).toBeNull();
      expect(persona!.max_tokens,).toBeNull();
      expect(persona!.model,).toBeNull();
    });
  });
});
