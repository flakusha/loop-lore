// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
/**
 * Read-only persistent-failure clustering: instance-scoped DB query plus
 * pure grouping. Per-test in-memory DB (created in beforeEach, awaited
 * teardown in afterEach), per-test instance slugs and keys — no shared state.
 */
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import {
  insertToolingReport,
  listPersistentFailureClusters,
  type ToolingReportInput,
} from "../../harness/reports";
import { resetReportSpoolPath, setReportSpoolPath, } from "../../harness/reports-spool";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { groupFailureClusters, } from "./cluster-miner";

let fixture: TestDb | null = null;
let db: TestDb["db"];

beforeEach(async () => {
  fixture = await createTestDb();
  db = fixture.db;
  // The ingest store mirrors to a JSONL spool best-effort. Clustering reads
  // only the DB, so force the spool off instead of touching the checkout.
  setReportSpoolPath(null,);
},);

afterEach(async () => {
  resetReportSpoolPath();
  const owned = fixture;
  fixture = null;
  if (owned !== null) { await destroyTestDb(owned,); }
},);

const instance = (): string => `inst-${crypto.randomUUID()}`;
const key = (): string => `cluster-${crypto.randomUUID()}`;

function persistent(instanceId: string, dedupeKey: string, ts: string,): ToolingReportInput {
  return {
    source: "harness",
    category: "persistent_failure",
    tool: "giwt",
    detail: "finalize failed at checks",
    instanceId,
    dedupeKey,
    ts,
  };
}

async function report(input: ToolingReportInput,): Promise<void> {
  const result = await insertToolingReport(db, input,);
  expect(result.ok,).toBe(true,);
}

describe("persistent failure clusters", () => {
  it("groups three reports sharing a dedupe_key into one count=3 cluster", async () => {
    const instanceId = instance();
    const dedupeKey = key();
    const first = "2026-11-20T10:00:00.000Z";
    const last = "2026-11-21T09:00:00.000Z";
    await report(persistent(instanceId, dedupeKey, first,),);
    await report(persistent(instanceId, dedupeKey, "2026-11-20T11:00:00.000Z",),);
    await report(persistent(instanceId, dedupeKey, last,),);

    const rows = await listPersistentFailureClusters(db, { instanceId, threshold: 3, },);
    const clusters = groupFailureClusters(rows,);

    expect(clusters,).toHaveLength(1,);
    expect(clusters[0],).toEqual({
      dedupeKey,
      tool: "giwt",
      count: 3,
      firstSeen: first,
      lastSeen: last,
    },);
  });

  it("excludes count=2 clusters at the default threshold", async () => {
    const instanceId = instance();
    const belowKey = key();
    const aboveKey = key();
    await report(persistent(instanceId, belowKey, "2026-11-20T10:00:00.000Z",),);
    await report(persistent(instanceId, belowKey, "2026-11-20T11:00:00.000Z",),);
    await report(persistent(instanceId, aboveKey, "2026-11-20T10:00:00.000Z",),);
    await report(persistent(instanceId, aboveKey, "2026-11-20T11:00:00.000Z",),);
    await report(persistent(instanceId, aboveKey, "2026-11-21T09:00:00.000Z",),);

    const rows = await listPersistentFailureClusters(db, { instanceId, },);
    expect(rows.map((row,) => row.dedupe_key),).toEqual([aboveKey,],);
    expect(groupFailureClusters(rows,).map((cluster,) => cluster.count),).toEqual([3,],);
  });

  it("never returns another instance's reports", async () => {
    const instanceId = instance();
    const ownKey = key();
    const foreignKey = key();
    await report(persistent(instanceId, ownKey, "2026-11-20T10:00:00.000Z",),);
    await report(persistent(instanceId, ownKey, "2026-11-20T11:00:00.000Z",),);
    await report(persistent(instanceId, ownKey, "2026-11-21T09:00:00.000Z",),);
    for (const ts of ["2026-11-20T10:00:00.000Z", "2026-11-20T11:00:00.000Z", "2026-11-21T09:00:00.000Z",]) {
      await report(persistent(instance(), foreignKey, ts,),);
    }

    const rows = await listPersistentFailureClusters(db, { instanceId, },);
    expect(rows.every((row,) => row.instance_id === instanceId),).toBe(true,);
    expect(groupFailureClusters(rows,),).toEqual([{
      dedupeKey: ownKey,
      tool: "giwt",
      count: 3,
      firstSeen: "2026-11-20T10:00:00.000Z",
      lastSeen: "2026-11-21T09:00:00.000Z",
    },],);
  });
});
