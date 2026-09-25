// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Database, } from "bun:sqlite";
import { Kysely, } from "kysely";
import type { DB, } from "../../db";
import { applyReflectionCheckpoint, } from "./bdi-reflection";
import { createInMemoryDb, } from "./__helpers/in-mem-db";

let db: Kysely<DB>;
let raw: Database;

beforeEach(async () => {
  ({ db, raw } = await createInMemoryDb());
  raw.exec("INSERT INTO actor_daily_plans(id, actor_id, plan_date, summary, priority, created_at) VALUES ('plan1', 'actor1', '2026-09-25', 'baseline plan', 'normal', datetime('now'));",);
},);

afterEach(() => {
  raw.close();
},);

describe("applyReflectionCheckpoint — priority shift", () => {
  test("emits a revision row when priorities change", async () => {
    const result = await applyReflectionCheckpoint(db, "plan1", {
      revision_kind: "priority_shift",
      before: "normal",
      after: "high",
      reason: "test",
    },);
    expect(result.emitted,).toBe(true,);
    expect(result.revisionId,).toBeDefined();

    const row = raw.query("SELECT * FROM actor_plan_revisions WHERE plan_id='plan1'",).get() as Record<string, unknown>;
    expect(row,).toBeDefined();
    expect(row.revision_kind,).toBe("priority_shift",);
    expect(row.before_priority,).toBe("normal",);
    expect(row.after_priority,).toBe("high",);
  },);

  test("does NOT emit a row when priorities match", async () => {
    const result = await applyReflectionCheckpoint(db, "plan1", {
      revision_kind: "priority_shift",
      before: "normal",
      after: "normal",
      reason: "no actual change",
    },);
    expect(result.emitted,).toBe(false,);
    expect(result.revisionId,).toBeUndefined();

    const count = raw.query("SELECT COUNT(*) AS c FROM actor_plan_revisions WHERE plan_id='plan1'",).get() as { c: number };
    expect(count.c,).toBe(0,);
  },);

  test("successive shifts emit one row each", async () => {
    await applyReflectionCheckpoint(db, "plan1", { revision_kind: "priority_shift", before: "normal", after: "high", reason: "a", },);
    await applyReflectionCheckpoint(db, "plan1", { revision_kind: "priority_shift", before: "high", after: "low", reason: "b", },);
    const count = raw.query("SELECT COUNT(*) AS c FROM actor_plan_revisions WHERE plan_id='plan1'",).get() as { c: number };
    expect(count.c,).toBe(2,);
  },);
},);
