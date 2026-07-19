import type { DB, } from "../db/schema";
import type { Kysely, } from "kysely";
import { PersonasService, } from "./service";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";

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

  describe("setDefault()", () => {
    test("sets a persona as default", async () => {
      const id = await service.create({ userId, name: "Default One", },);
      await service.setDefault(id, userId,);
      const def = await service.getDefault(userId,);
      expect(def,).toBeTruthy();
      expect(def!.id,).toBe(id,);
    });

    test("unsets previous default when setting new one", async () => {
      const id1 = await service.create({ userId, name: "First Default", },);
      const id2 = await service.create({ userId, name: "Second Default", },);

      await service.setDefault(id1, userId,);
      await service.setDefault(id2, userId,);

      const def = await service.getDefault(userId,);
      expect(def!.id,).toBe(id2,);
    });
  });

  describe("getDefault()", () => {
    test("returns null when no default set", async () => {
      const freshId = "fresh-user-2";
      await db
        .insertInto("users",)
        .values({
          id: freshId,
          username: "freshuser2",
          display_name: "Fresh2",
          role: "solo",
          status: "active",
          settings: "{}",
          password_hash: "hash",
        },)
        .execute();

      const def = await service.getDefault(freshId,);
      expect(def,).toBeUndefined();
    });
  });
});
