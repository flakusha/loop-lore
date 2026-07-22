/**
 * Tests for memory decay and touch logic.
 */
import { Database, } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { Kysely, } from "kysely";
import { createSqliteDialect, } from "../db";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { applyDecay, touchMemory, } from "./purge";

function createTestDb(): Kysely<DB> {
  const sqlite = new Database(":memory:",);
  sqlite.run("PRAGMA foreign_keys = OFF",);
  const dialect = createSqliteDialect(sqlite,);
  return new Kysely<DB>({ dialect, },);
}

function createTestSchema(db: Kysely<DB>,): void {
  db.schema
    .createTable("actor_memories",)
    .addColumn("id", "text",)
    .addColumn("actor_id", "text",)
    .addColumn("content", "text",)
    .addColumn("memory_type", "text",)
    .addColumn("confidence", "real",)
    .addColumn("importance", "integer",)
    .addColumn("keywords", "text",)
    .addColumn("strength", "real",)
    .addColumn("decay_rate", "real",)
    .addColumn("last_accessed_at", "text",)
    .addColumn("scope", "text",)
    .addColumn("privacy", "text",)
    .addColumn("pinned", "integer",)
    .addColumn("created_at", "text",)
    .addColumn("updated_at", "text",)
    .execute();
}

async function seedMemory(
  db: Kysely<DB>,
  overrides: Partial<{
    id: string;
    actor_id: string;
    content: string;
    strength: number;
    decay_rate: number;
    last_accessed_at: string | null;
  }> = {},
): Promise<void> {
  const id = overrides.id ?? "mem-1";
  const actorId = overrides.actor_id ?? "actor-1";
  const content = overrides.content ?? "Test memory";
  const strength = overrides.strength ?? 1;
  const decayRate = overrides.decay_rate ?? 0.1;
  const lastAccessed = overrides.last_accessed_at ?? null;

  await db
    .insertInto("actor_memories",)
    .values({
      id,
      actor_id: actorId,
      content,
      memory_type: "episodic" as const,
      confidence: 1,
      importance: 1,
      keywords: "[]",
      strength,
      decay_rate: decayRate,
      last_accessed_at: lastAccessed,
      scope: "character",
      privacy: "shared",
      pinned: 0,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    },)
    .execute();
}

describe("applyDecay", () => {
  let db: Kysely<DB>;

  beforeEach(async () => {
    createLogger({ level: "error", },);
    db = createTestDb();
    createTestSchema(db,);
  },);

  afterEach(async () => {
    await db.destroy();
  },);

  it("should decay strength based on decay_rate and elapsed time", async () => {
    await seedMemory(db, {
      id: "mem-1",
      strength: 1,
      decay_rate: 0.1,
      last_accessed_at: "2024-01-01T00:00:00Z",
    },);

    const now = new Date("2024-01-11T00:00:00Z",);
    const affected = await applyDecay(db, { now, },);

    expect(affected,).toBe(1,);

    const updated = await db
      .selectFrom("actor_memories",)
      .select("strength",)
      .where("id", "=", "mem-1",)
      .executeTakeFirst();

    // strength = 1.0 - (0.1 * 10) = 0.0
    expect(updated?.strength,).toBeCloseTo(0, 5,);
  });

  it("should not decay memories with decay_rate 0", async () => {
    await seedMemory(db, {
      id: "mem-1",
      strength: 1,
      decay_rate: 0,
      last_accessed_at: "2024-01-01T00:00:00Z",
    },);

    const now = new Date("2024-06-01T00:00:00Z",);
    const affected = await applyDecay(db, { now, },);

    expect(affected,).toBe(0,);

    const updated = await db
      .selectFrom("actor_memories",)
      .select("strength",)
      .where("id", "=", "mem-1",)
      .executeTakeFirst();

    expect(updated?.strength,).toBe(1,);
  });

  it("should not decay memories with strength 0", async () => {
    await seedMemory(db, {
      id: "mem-1",
      strength: 0,
      decay_rate: 0.1,
      last_accessed_at: "2024-01-01T00:00:00Z",
    },);

    const now = new Date("2024-01-11T00:00:00Z",);
    const affected = await applyDecay(db, { now, },);

    expect(affected,).toBe(0,);
  });

  it("should clamp strength to 0 minimum", async () => {
    await seedMemory(db, {
      id: "mem-1",
      strength: 0.5,
      decay_rate: 0.1,
      last_accessed_at: "2024-01-01T00:00:00Z",
    },);

    const now = new Date("2024-06-01T00:00:00Z",);
    const affected = await applyDecay(db, { now, },);

    expect(affected,).toBe(1,);

    const updated = await db
      .selectFrom("actor_memories",)
      .select("strength",)
      .where("id", "=", "mem-1",)
      .executeTakeFirst();

    expect(updated?.strength,).toBe(0,);
  });
});

describe("touchMemory", () => {
  let db: Kysely<DB>;

  beforeEach(async () => {
    createLogger({ level: "error", },);
    db = createTestDb();
    createTestSchema(db,);
  },);

  afterEach(async () => {
    await db.destroy();
  },);

  it("should update last_accessed_at and boost strength", async () => {
    await seedMemory(db, {
      id: "mem-1",
      strength: 0.5,
      decay_rate: 0.1,
      last_accessed_at: "2024-01-01T00:00:00Z",
    },);

    await touchMemory(db, "mem-1",);

    const updated = await db
      .selectFrom("actor_memories",)
      .select(["last_accessed_at", "strength",],)
      .where("id", "=", "mem-1",)
      .executeTakeFirst();

    expect(updated?.last_accessed_at,).not.toBe("2024-01-01T00:00:00Z",);
    expect(updated?.last_accessed_at,).toBeDefined();
    // strength should be boosted by 0.1
    expect(updated?.strength,).toBeCloseTo(0.6, 5,);
  });

  it("should boost strength by 0.1 each touch", async () => {
    await seedMemory(db, {
      id: "mem-1",
      strength: 0.3,
      decay_rate: 0.1,
      last_accessed_at: null,
    },);

    await touchMemory(db, "mem-1",);
    await touchMemory(db, "mem-1",);

    const updated = await db
      .selectFrom("actor_memories",)
      .select("strength",)
      .where("id", "=", "mem-1",)
      .executeTakeFirst();

    // 0.3 + 0.1 + 0.1 = 0.5
    expect(updated?.strength,).toBeCloseTo(0.5, 5,);
  });
});
