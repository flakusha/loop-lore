// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * The budget store: operator-set rows (migration 068) become live budgets the
 * guard enforces, and a reload keeps them while the counters reset.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { PeerBudgetMode, PeerWorkloadClass, } from "../db/enums";
import { createTestDb, destroyTestDb, type TestDb, } from "../test-utils/create-test-db";
import { upsertPeer, } from "./coordinator";
import { resetPerformanceQuota, trackedPerformanceQuotaCells, } from "./performance-quota";
import { admitPeerWork, } from "./performance-quota-guard";
import { listPerformanceBudgets, reloadPerformanceQuota, } from "./performance-quota-store";

const ORIGIN = "https://gpu.example";
const T0 = 1_700_000_000_000;

let fixture: TestDb;

beforeEach(async () => {
  fixture = await createTestDb();
  resetPerformanceQuota();
  await upsertPeer(fixture.db, { origin: ORIGIN, state: "trusted", },);
},);

afterEach(async () => {
  resetPerformanceQuota();
  await destroyTestDb(fixture,);
},);

describe("performance budget persistence", () => {
  test("a stored budget reads back and is enforced end to end", async () => {
    await fixture.db
      .insertInto("federation_performance_budgets",)
      .values({
        origin: ORIGIN,
        workload_class: PeerWorkloadClass.Chat,
        budget_mode: PeerBudgetMode.Hard,
        requests_per_minute: 1,
        updated_at: "2026-01-01T00:00:00.000Z",
      },)
      .execute();

    const budgets = await reloadPerformanceQuota({ database: fixture.db, enabled: true, },);
    expect(budgets,).toHaveLength(1,);
    expect(budgets[0]?.requestsPerMinute,).toBe(1,);

    expect(
      (await admitPeerWork(
        { origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, peerTrusted: true, now: T0, },
        async () => "ok",
      )).admitted,
    ).toBe(true,);

    const refused = await admitPeerWork(
      { origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, peerTrusted: true, now: T0 + 1, },
      async () => "ok",
    );

    expect(refused.admitted,).toBe(false,);
    if (!refused.admitted) { expect(refused.response.status,).toBe(429,); }
  });

  test("no rows means every peer is unlimited", async () => {
    await reloadPerformanceQuota({ database: fixture.db, enabled: true, },);
    expect(await listPerformanceBudgets(fixture.db,),).toEqual([],);

    for (let i = 0; i < 50; i += 1) {
      expect(
        (await admitPeerWork(
          { origin: ORIGIN, workloadClass: PeerWorkloadClass.Image, peerTrusted: true, now: T0 + i, },
          async () => "ok",
        )).admitted,
      ).toBe(true,);
    }
  });

  test("a reloaded budget survives a counter reset and still refuses", async () => {
    await fixture.db
      .insertInto("federation_performance_budgets",)
      .values({
        origin: ORIGIN,
        workload_class: PeerWorkloadClass.Chat,
        budget_mode: PeerBudgetMode.Hard,
        requests_per_minute: 1,
        updated_at: "2026-01-01T00:00:00.000Z",
      },)
      .execute();

    await reloadPerformanceQuota({ database: fixture.db, enabled: true, },);
    await admitPeerWork(
      { origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, peerTrusted: true, now: T0, },
      async () => "ok",
    );

    resetPerformanceQuota();
    expect(trackedPerformanceQuotaCells(),).toBe(0,);
    await reloadPerformanceQuota({ database: fixture.db, enabled: true, },);

    const first = await admitPeerWork(
      { origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, peerTrusted: true, now: T0, },
      async () => "ok",
    );

    expect(first.admitted, "counters start at zero after the restart",).toBe(true,);

    const second = await admitPeerWork(
      { origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, peerTrusted: true, now: T0 + 1, },
      async () => "ok",
    );

    expect(second.admitted, "the stored budget still refuses",).toBe(false,);
  });

  test("a malformed row is dropped rather than silently read as unlimited", async () => {
    await fixture.db
      .insertInto("federation_performance_budgets",)
      .values({
        origin: ORIGIN,
        workload_class: "gpu-mining" as PeerWorkloadClass,
        budget_mode: PeerBudgetMode.Hard,
        max_concurrency: 1,
        updated_at: "2026-01-01T00:00:00.000Z",
      },)
      .execute();

    expect(await listPerformanceBudgets(fixture.db,),).toEqual([],);
    await reloadPerformanceQuota({ database: fixture.db, enabled: true, },);
    expect(trackedPerformanceQuotaCells(),).toBe(0,);
  });

  test("a non-positive ceiling is normalised away, not enforced as a refusal wall", async () => {
    await fixture.db
      .insertInto("federation_performance_budgets",)
      .values({
        origin: ORIGIN,
        workload_class: PeerWorkloadClass.Chat,
        budget_mode: PeerBudgetMode.Hard,
        max_concurrency: 0,
        requests_per_minute: 5,
        updated_at: "2026-01-01T00:00:00.000Z",
      },)
      .execute();

    const [budget,] = await listPerformanceBudgets(fixture.db,);
    expect(budget?.maxConcurrency,).toBeNull();
    expect(budget?.requestsPerMinute,).toBe(5,);
  });

  test("a budget row is removed with its peer row", async () => {
    await fixture.db
      .insertInto("federation_performance_budgets",)
      .values({
        origin: ORIGIN,
        workload_class: PeerWorkloadClass.Chat,
        budget_mode: PeerBudgetMode.Hard,
        requests_per_minute: 1,
        updated_at: "2026-01-01T00:00:00.000Z",
      },)
      .execute();

    await fixture.db.deleteFrom("mesh_peers",).where("origin", "=", ORIGIN,).execute();

    expect(await listPerformanceBudgets(fixture.db,),).toEqual([],);
  });
});
