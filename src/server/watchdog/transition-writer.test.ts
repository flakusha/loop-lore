// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Per-test in-memory DB: proves transitions reach the exec-log table with the
// decision's reason/misses/crashes projected onto the right columns, and that
// flush() waits for in-flight writes before shutdown.
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, type Logger, } from "../../logger";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { createState, type WatchdogDecision, type WatchdogTransition, } from "./state";
import { createTransitionWriter, toDecisionFields, } from "./transition-writer";

let fixture: TestDb;
let db: Kysely<DB>;
let logger: Logger;

beforeEach(async () => {
  fixture = await createTestDb();
  db = fixture.db;
  logger = createLogger({ level: "error", },);
},);

afterEach(async () => {
  await destroyTestDb(fixture,);
},);

function transition(decision: WatchdogDecision,): WatchdogTransition {
  const state = createState(1_000,);
  return { event_kind: "crash", from: state, to: state, decision, at: 1_234, };
}

describe("toDecisionFields", () => {
  test("projects each decision kind onto the exec-log columns", () => {
    expect(toDecisionFields({ kind: "restart", delayMs: 5, attempt: 1, },),).toEqual({
      decision_kind: "restart",
      reason: null,
      misses: null,
      crashes: null,
    },);

    expect(toDecisionFields({ kind: "kill", reason: "probe-misses", misses: 3, },),).toEqual({
      decision_kind: "kill",
      reason: "probe-misses",
      misses: 3,
      crashes: null,
    },);

    expect(toDecisionFields({ kind: "stop", reason: "crash-threshold", crashes: 2, },),).toEqual({
      decision_kind: "stop",
      reason: "crash-threshold",
      misses: null,
      crashes: 2,
    },);

    expect(toDecisionFields({ kind: "wait", },),).toEqual({
      decision_kind: "wait",
      reason: null,
      misses: null,
      crashes: null,
    },);
  });
});

describe("createTransitionWriter", () => {
  test("persists a transition and flush() drains it before shutdown", async () => {
    const writer = createTransitionWriter(db, logger,);
    writer(transition({ kind: "kill", reason: "probe-misses", misses: 4, },),);
    await writer.flush();

    const rows = await db.selectFrom("watchdog_events",).selectAll().execute();
    expect(rows,).toHaveLength(1,);
    expect(rows[0],).toMatchObject({
      event_kind: "crash",
      decision_kind: "kill",
      at_ms: 1_234,
      reason: "probe-misses",
      misses: 4,
      crashes: null,
    },);
  });

  test("keeps wait decisions verbatim with only the clock carried", async () => {
    const writer = createTransitionWriter(db, logger,);
    const t = transition({ kind: "wait", },);
    t.event_kind = "probe";
    writer(t,);
    await writer.flush();

    const rows = await db.selectFrom("watchdog_events",).selectAll().execute();
    expect(rows,).toHaveLength(1,);
    expect(rows[0],).toMatchObject({
      event_kind: "probe",
      decision_kind: "wait",
      at_ms: 1_234,
      reason: null,
      misses: null,
      crashes: null,
    },);
  });
});
