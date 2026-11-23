// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, resetTestDb, type TestDb, } from "../test-utils/create-test-db";
import {
  classifyDecoyHit,
  clearIndicators,
  DEFAULT_TTL_MS,
  listIndicators,
  pruneExpiredIndicators,
  recordIndicator,
} from "./classification";
import {
  type DecoyHit,
  type DecoyListener,
  startDecoyListener,
} from "./decoy-listener";
import { createDecoyHitSink, } from "./ingest";

let db: Kysely<DB>;
let sqlite: TestDb["sqlite"];

const NOW = new Date("2026-11-23T00:00:00.000Z",);
const IP = "203.0.113.7";

/**
 * @param overrides
 */
function makeHit(overrides: Partial<DecoyHit> = {},): DecoyHit {
  return {
    at: NOW.toISOString(),
    ip: IP,
    kind: "bait",
    method: "GET",
    path: "/admin",
    ...overrides,
  };
}

beforeAll(async () => {
  const created = await createTestDb();
  db = created.db;
  sqlite = created.sqlite;
},);

beforeEach(() => {
  resetTestDb(sqlite,);
},);

afterAll(() => {
  db.destroy();
},);

describe("classifyDecoyHit (pure)", () => {
  test("ignores benign and unrecognized hits", () => {
    expect(classifyDecoyHit(makeHit({ kind: "robots", path: "/robots.txt", },),),).toBeNull();
    expect(classifyDecoyHit(makeHit({ kind: "unknown", path: "/nope", },),),).toBeNull();
  });

  test("bait and fake-auth are suspicion with different confidence", () => {
    const bait = classifyDecoyHit(makeHit(),);
    const auth = classifyDecoyHit(makeHit({ kind: "fake-auth", path: "/api/v1/auth/login", },),);
    expect(bait?.label,).toBe("suspicion",);
    expect(auth?.label,).toBe("suspicion",);
    expect(bait?.confidence,).toBeLessThan(auth?.confidence ?? 0,);
    expect(bait?.source,).toBe("decoy",);
  });

  test("indicator is a stable digest, never a raw IP", () => {
    const first = classifyDecoyHit(makeHit(),);
    const again = classifyDecoyHit(makeHit(),);
    expect(first?.indicator,).toBe(again?.indicator,);
    expect(first?.indicator,).not.toContain(IP,);
    expect(first?.indicator.startsWith("decoy:",),).toBe(true,);
  });
});

describe("local classification store", () => {
  test("records, lists, prunes, and clears labels", async () => {
    const classification = classifyDecoyHit(makeHit(),)!;
    await recordIndicator(db, classification, { id: "row-1", now: NOW, ttlMs: 1000, },);

    let rows = await listIndicators(db, NOW,);
    expect(rows.length,).toBe(1,);
    expect(rows[0]?.expiresAt,).toBe(new Date(NOW.getTime() + 1000,).toISOString(),);

    expect(await pruneExpiredIndicators(db, new Date(NOW.getTime() + 1001,),),).toBe(1,);
    rows = await listIndicators(db, NOW,);
    expect(rows.length,).toBe(0,);

    await recordIndicator(db, classification, { id: "row-2", now: NOW, },);
    const defaulted = await listIndicators(db, NOW,);
    expect(defaulted[0]?.expiresAt,).toBe(new Date(NOW.getTime() + DEFAULT_TTL_MS,).toISOString(),);
    expect(await clearIndicators(db,),).toBe(1,);
    expect(await listIndicators(db, NOW,),).toEqual([],);
  });

  test("prunes expired rows on the next write", async () => {
    const classification = classifyDecoyHit(makeHit(),)!;
    await recordIndicator(db, classification, { id: "old", now: NOW, ttlMs: 1000, },);
    await recordIndicator(db, classification, { id: "fresh", now: new Date(NOW.getTime() + 2000,), },);

    const all = await db.selectFrom("honeypot_indicators",).select(["id",],).execute();
    expect(all,).toHaveLength(1,);
    expect(all[0]?.id,).toBe("fresh",);
  });
});

describe("decoy hit sink", () => {
  test("kill switch records nothing while the decoy still serves", async () => {
    const sink = createDecoyHitSink(db, { enabled: false, },);
    await sink(makeHit(),);
    expect(await listIndicators(db, NOW,),).toEqual([],);
  });

  test("stores labels from real decoy hits with no caller-supplied ids", async () => {
    const recorded = Promise.withResolvers<{ indicator: string }>();
    const sink = createDecoyHitSink(db, {
      onClassified: (row,) => {
        recorded.resolve(row,);
      },
    },);

    let listener: DecoyListener | null = null;

    try {
      listener = startDecoyListener({ onHit: sink, },);
      const response = await fetch(`${listener.url}/admin`,);
      expect(response.status,).toBe(200,);

      const row = await recorded.promise;
      const rows = await listIndicators(db,);
      expect(rows.length,).toBe(1,);
      expect(rows[0]?.indicator,).toBe(row.indicator,);
      expect(rows[0]?.label,).toBe("suspicion",);
    } finally {
      await listener?.stop();
    }
  });
});
