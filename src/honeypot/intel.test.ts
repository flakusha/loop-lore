// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, resetTestDb, type TestDb, } from "../test-utils/create-test-db";
import { toDate, } from "../utils/date";
import {
  INTEL_ACTIONS,
  INTEL_TYPES,
  type IntelFeed,
  intelMaterial,
  intelPullMaterial,
  type IntelRecord,
  MAX_AGE_MS,
  MAX_FEED_BYTES,
  MAX_FEED_ENTRIES,
  MAX_PER_PEER,
  MAX_SKEW_MS,
  MAX_TTL_MS,
  parseIntelFeed,
  signIntelFeed,
  signIntelPull,
  verifyIntelProof,
} from "./intel";
import {
  countActiveForPeer,
  delistIntelForPeer,
  listActiveIntel,
  pruneExpiredIntel,
  recordIntel,
} from "./intel-store";

const PSK = "unit-psk";
const PEER = "https://a.example";
const NOW = toDate("2026-11-24T00:00:00.000Z",);
const INDICATOR = "decoy:abcdef1234:suspicion";

let db: Kysely<DB>;
let sqlite: TestDb["sqlite"];

/**
 * @param overrides
 * @returns a valid record
 */
function record(overrides: Partial<IntelRecord> = {},): IntelRecord {
  return {
    action: "report",
    confidence: 0.4,
    createdAt: "2026-11-23T23:59:00.000Z",
    expiresAt: "2026-11-24T23:59:00.000Z",
    indicator: INDICATOR,
    nonce: "nonce-1",
    sourcePeer: PEER,
    type: "suspicion",
    ...overrides,
  };
}

/**
 * @param overrides
 * @returns a valid feed
 */
function feed(overrides: Partial<IntelFeed> = {},): IntelFeed {
  return { origin: PEER, records: [record(),], ...overrides, };
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

describe("intel proof", () => {
  test("signs push and pull material; tampering breaks the proof", async () => {
    const valid = feed();
    const proof = await signIntelFeed(PSK, valid,);
    expect(await verifyIntelProof(PSK, intelMaterial(valid,), proof,),).toBe(true,);

    const tampered = feed({ records: [record({ confidence: 0.9, },),], },);
    expect(await verifyIntelProof(PSK, intelMaterial(tampered,), proof,),).toBe(false,);

    const pullProof = await signIntelPull(PSK, PEER, "2026-11-24T00:00:00.000Z",);
    expect(
      await verifyIntelProof(
        PSK,
        intelPullMaterial(PEER, "2026-11-24T00:00:00.000Z",),
        pullProof,
      ),
    ).toBe(true,);

    expect(await verifyIntelProof(PSK, intelPullMaterial(PEER,), pullProof,),).toBe(false,);
  });
});

describe("intel feed bounds", () => {
  test("constants keep a batch inside a peer budget and reject edge timestamps", () => {
    expect(INTEL_TYPES,).toContain("suspicion",);
    expect(INTEL_ACTIONS,).toContain("delist",);
    expect(MAX_PER_PEER,).toBeGreaterThan(MAX_FEED_ENTRIES,);

    const tooOld = record({ createdAt: toDate(NOW.getTime() - MAX_AGE_MS - 1,).toISOString(), },);
    const tooFuture = record({ createdAt: toDate(NOW.getTime() + MAX_SKEW_MS + 1,).toISOString(), },);
    const tooLong = record({ expiresAt: toDate(NOW.getTime() + MAX_TTL_MS + 1,).toISOString(), },);
    for (const bad of [tooOld, tooFuture, tooLong,]) {
      expect(parseIntelFeed({ origin: PEER, records: [bad,], proof: "x".repeat(64,), }, NOW,).ok,).toBe(false,);
    }

    const oversized = record({ indicator: `decoy:${"a".repeat(MAX_FEED_BYTES,)}:suspicion`, },);
    expect(parseIntelFeed({ origin: PEER, records: [oversized,], proof: "x".repeat(64,), }, NOW,).ok,).toBe(false,);
  });
});

describe("parseIntelFeed", () => {
  test("accepts a bounded report feed", async () => {
    const valid = feed();
    const parsed = parseIntelFeed({ ...valid, proof: await signIntelFeed(PSK, valid,), }, NOW,);
    expect(parsed.ok,).toBe(true,);
    if (parsed.ok) { expect(parsed.feed.records[0]?.indicator,).toBe(INDICATOR,); }
  });

  test("rejects raw indicators, stale/expired records, and out-of-range confidence", () => {
    expect(
      parseIntelFeed(
        { origin: PEER, records: [record({ indicator: "203.0.113.7", },),], proof: "x".repeat(64,), },
        NOW,
      ).ok,
    ).toBe(false,);

    expect(
      parseIntelFeed({
        origin: PEER,
        records: [record({ createdAt: "2020-01-01T00:00:00.000Z", },),],
        proof: "x".repeat(64,),
      }, NOW,).ok,
    ).toBe(false,);

    expect(
      parseIntelFeed({
        origin: PEER,
        records: [record({ expiresAt: "2026-11-23T23:59:30.000Z", },),],
        proof: "x".repeat(64,),
      }, NOW,).ok,
    ).toBe(false,);

    expect(parseIntelFeed({ origin: PEER, records: [record({ confidence: 2, },),], proof: "x".repeat(64,), }, NOW,).ok,)
      .toBe(false,);
  });

  test("rejects oversized and overlong feeds", () => {
    const tooMany = feed({ records: Array.from({ length: MAX_FEED_ENTRIES + 1, }, () => record({ nonce: "n", },),), },);
    expect(parseIntelFeed({ ...tooMany, proof: "x".repeat(64,), }, NOW,).ok,).toBe(false,);
    expect(
      parseIntelFeed(
        { origin: PEER, records: [record({ indicator: "a".repeat(500,), },),], proof: "x".repeat(64,), },
        NOW,
      ).ok,
    ).toBe(false,);
  });
});

describe("local reports store", () => {
  test("deduplicates nonces, scopes delists, lists and prunes by TTL", async () => {
    const first = record();
    expect(await recordIntel(db, first, NOW,),).toBe(true,);
    expect(await recordIntel(db, first, NOW,),).toBe(false,);
    expect(await countActiveForPeer(db, PEER, NOW,),).toBe(1,);

    await recordIntel(
      db,
      record({ nonce: "nonce-2", sourcePeer: "https://b.example", indicator: "decoy:other:suspicion", },),
      NOW,
    );

    expect(await delistIntelForPeer(db, INDICATOR, "https://b.example",),).toBe(0,);
    expect(await listActiveIntel(db, { now: NOW, },),).toHaveLength(2,);

    expect(await delistIntelForPeer(db, INDICATOR, PEER,),).toBe(1,);
    expect(await listActiveIntel(db, { now: NOW, },),).toHaveLength(1,);

    const expired = record({
      nonce: "nonce-3",
      expiresAt: "2026-11-24T00:00:01.000Z",
      indicator: "decoy:expired:suspicion",
    },);

    await recordIntel(db, expired, NOW,);
    expect(await pruneExpiredIntel(db, toDate(NOW.getTime() + 2000,),),).toBe(1,);
    expect(await listActiveIntel(db, { now: NOW, },),).toHaveLength(1,);
  });
});
