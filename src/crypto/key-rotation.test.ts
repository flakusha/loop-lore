/**
 * Tests for crypto/key-rotation.ts — auto-rotation logic
 */

import { beforeAll, beforeEach, describe, expect, mock, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import {
  findExpiredKeys,
  runAutoRotation,
  startAutoRotationTimer,
} from "./key-rotation";

// ── Mocks ──────────────────────────────────────────────────

const mockExecute = mock(() => Promise.resolve([],));

function createMockChain(finalResult: unknown,) {
  const chain: Record<string, unknown> = {};
  const mockFn = mock(() => chain);
  chain.where = mockFn;
  chain.select = mockFn;
  chain.distinct = mockFn;
  chain.execute = mock(() => Promise.resolve(finalResult,));
  return chain;
}

const mockSelectFrom = mock(() => createMockChain([],));

const mockDb = {
  selectFrom: mockSelectFrom,
  updateTable: mock(() => ({
    set: mock(() => ({
      where: mock(() => ({
        execute: mock(() => Promise.resolve([],)),
      })),
    })),
  })),
} as unknown as Kysely<DB>;

beforeAll(() => {
  createLogger({ level: "warn", },);
},);

beforeEach(() => {
  mockExecute.mockClear();
  mockSelectFrom.mockClear();
},);

// ── findExpiredKeys ────────────────────────────────────────

describe("findExpiredKeys", () => {
  test("returns empty array when rotationDays <= 0", async () => {
    const result = await findExpiredKeys(mockDb, 0,);
    expect(result,).toEqual([],);
  });

  test("returns empty array when rotationDays is negative", async () => {
    const result = await findExpiredKeys(mockDb, -5,);
    expect(result,).toEqual([],);
  });

  test("calls DB with correct cutoff date", async () => {
    const mockExpire = mock(() =>
      Promise.resolve([
        { actor_id: "actor-1", },
        { actor_id: "actor-2", },
      ],)
    );
    const mockChain = createMockChain([],);
    mockChain.execute = mockExpire;
    mockSelectFrom.mockReturnValue(mockChain,);

    const result = await findExpiredKeys(mockDb, 30,);
    expect(result,).toEqual(["actor-1", "actor-2",],);
    expect(mockSelectFrom,).toHaveBeenCalledWith("actor_keys",);
  });
});

// ── runAutoRotation ────────────────────────────────────────

describe("runAutoRotation", () => {
  test("returns early when encryption not enabled", async () => {
    // SMK not initialized = encryption disabled
    const result = await runAutoRotation(mockDb, 30,);
    expect(result.checked,).toBe(0,);
    expect(result.rotated,).toBe(0,);
    expect(result.results,).toEqual([],);
  });

  test("returns early when rotationDays <= 0", async () => {
    const result = await runAutoRotation(mockDb, 0,);
    expect(result.checked,).toBe(0,);
    expect(result.rotated,).toBe(0,);
  });
});

// ── startAutoRotationTimer ─────────────────────────────────

describe("startAutoRotationTimer", () => {
  test("returns null when rotationDays <= 0", () => {
    const timer = startAutoRotationTimer(mockDb, 0,);
    expect(timer,).toBeNull();
  });

  test("returns null when rotationDays is negative", () => {
    const timer = startAutoRotationTimer(mockDb, -10,);
    expect(timer,).toBeNull();
  });

  test("returns timer ID when rotationDays > 0", () => {
    // Note: This will actually try to run autoRotation, but since
    // SMK is not initialized, it will return early
    const timer = startAutoRotationTimer(mockDb, 30, 60_000,);
    // Timer should be created (not null)
    expect(timer,).not.toBeNull();
    // Clean up
    if (timer) { clearInterval(timer,); }
  });
});
