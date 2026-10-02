// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * WorkflowDagEngine unit tests.
 *
 * Covers the four acceptance cases plus the two invariants the engine
 * would silently break otherwise:
 *   - diamond DAG (A→B, A→C, B→D, C→D) resolves in dependency order
 *   - a cycle-forming insert is REJECTED and leaves existing rows alone
 *   - on_failure: skip cascades to dependents
 *   - on_failure: retry keeps the dependent eligible
 *   - a failed node is recorded, not thrown, and does not strand siblings
 *   - statusMap covers every node including never-scheduled ones
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import { createTestDb, resetTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { WorkflowDagEngine, } from "./engine";
import type { TaskRegistry, TaskRunner, } from "./types";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await createTestDb();
},);
afterAll(async () => {
  await testDb.db.destroy();
},);
beforeEach(() => {
  resetTestDb(testDb.sqlite,);
},);

/** Deterministic RNG — the engine passes it straight to task bodies,
 *  and no assertion here depends on its value.
 */
const RNG = (): number => 0.5;
const T0 = 1_700_000_000_000;

/** A task body that records it ran and succeeds. */
function ok(id: string, order: string[],): TaskRunner {
  return () => {
    order.push(id,);
    return Promise.resolve();
  };
}

/** A task body that records it ran, then fails. */
function boom(id: string, order: string[],): TaskRunner {
  return () => {
    order.push(id,);
    return Promise.reject(new Error(`${id} exploded`,));
  };
}

/** Registry from id → runner, skipping absent entries. */
function registry(...runners: [string, TaskRunner][]): TaskRegistry {
  return new Map<string, TaskRunner>(runners,);
}

/** Count of rows currently in task_dependencies. */
async function edgeCount(): Promise<number> {
  const rows = await testDb.db.selectFrom("task_dependencies",).selectAll().execute();
  return rows.length;
}

describe("WorkflowDagEngine — hydrate from stored edges", () => {
  test("a fresh engine rebuilds the graph from task_dependencies", async () => {
    const first = new WorkflowDagEngine(testDb.db,);
    await first.addDependency("B", "A",);
    await first.addDependency("C", "A",);
    await first.addDependency("D", "B", "retry",);

    // A new engine shares the db but not the first one's memory.
    const second = new WorkflowDagEngine(testDb.db,);
    expect(second.dependsOn("D",),).toEqual([],);
    await second.hydrate();
    expect(second.dependsOn("B",),).toEqual(["A",],);
    expect(second.dependsOn("D",),).toEqual(["B",],);

    // Edges alone are enough to drive a pass, in dependency order.
    const order: string[] = [];
    const result = await second.runPass(
      registry(["A", ok("A", order,)], ["B", ok("B", order,)], ["C", ok("C", order,)], ["D", ok("D", order,)],),
      T0,
      RNG,
    );
    expect(result.ran.toSorted(),).toEqual(["A", "B", "C", "D",],);
    expect(order.indexOf("A",),).toBeLessThan(order.indexOf("B",),);
    expect(order.indexOf("B",),).toBeLessThan(order.indexOf("D",),);
  },);

  test("node state is NOT restored, so a rehydrated graph re-derives progress", async () => {
    const first = new WorkflowDagEngine(testDb.db,);
    await first.addDependency("B", "A",);
    await first.runPass(registry(["A", ok("A", [],)], ["B", ok("B", [],)],), T0, RNG,);
    expect(first.statusMap().nodes.A?.state,).toBe("done",);

    const second = new WorkflowDagEngine(testDb.db,);
    await second.hydrate();
    // `done` was never persisted, so the node reads as blocked rather
    // than falsely claiming its work survived the restart.
    expect(second.statusMap().nodes.A?.state,).toBe("blocked",);
  },);
});

describe("WorkflowDagEngine — diamond DAG", () => {
  test("A→B, A→C, B→D, C→D runs every node with prerequisites first", async () => {
    const engine = new WorkflowDagEngine(testDb.db,);
    await engine.addDependency("B", "A",);
    await engine.addDependency("C", "A",);
    await engine.addDependency("D", "B",);
    await engine.addDependency("D", "C",);

    const order: string[] = [];
    const result = await engine.runPass(
      registry(["A", ok("A", order,)], ["B", ok("B", order,)], ["C", ok("C", order,)], [
        "D",
        ok("D", order,),
      ],),
      T0,
      RNG,
    );

    // A before both branches; D last, after BOTH of its prerequisites.
    expect(result.ran,).toEqual(["A", "B", "C", "D",]);
    expect(order[0],).toBe("A",);
    expect(order[3],).toBe("D",);
    expect(result.failed,).toEqual([],);
    expect(result.skipped,).toEqual([],);
    expect(result.blocked,).toEqual([],);
  },);

  test("D is not dispatched until both B and C are done", async () => {
    const engine = new WorkflowDagEngine(testDb.db,);
    // `retry` on both edges, so D waits rather than being abandoned:
    // the point under test is eligibility, not the failure policy.
    await engine.addDependency("D", "B", "retry",);
    await engine.addDependency("D", "C", "retry",);

    const order: string[] = [];
    // B fails, so D can never unblock on this pass.
    const result = await engine.runPass(
      registry(["B", boom("B", order,)], ["C", ok("C", order,)], ["D", ok("D", order,)],),
      T0,
      RNG,
    );

    expect(result.ran,).toEqual(["C",],);
    expect(order,).not.toContain("D",);
    // B and C are independent, so both dispatch; only D is held back.
    expect(order.toSorted(),).toEqual(["B", "C",],);
    expect(result.blocked,).toEqual(["D",],);
  },);
});

describe("WorkflowDagEngine — cycle rejection at insert", () => {
  test("a direct back-edge is rejected and persists nothing", async () => {
    const engine = new WorkflowDagEngine(testDb.db,);
    await engine.addDependency("B", "A",);
    expect(await edgeCount(),).toBe(1,);

    // A depends on B would close A→B→A.
    await expect(engine.addDependency("A", "B",)).rejects.toThrow(/cycle rejected/,);

    // The pre-existing edge survives the rejection.
    expect(await edgeCount(),).toBe(1,);
    expect(engine.dependsOn("B",),).toEqual(["A",],);
    expect(engine.dependsOn("A",),).toEqual([],);
  },);

  test("a transitive back-edge is rejected", async () => {
    const engine = new WorkflowDagEngine(testDb.db,);
    await engine.addDependency("B", "A",);
    await engine.addDependency("C", "B",);
    expect(await edgeCount(),).toBe(2,);

    // A→B→C, so C→A closes the loop three hops down.
    await expect(engine.addDependency("A", "C",)).rejects.toThrow(/cycle rejected/,);
    expect(await edgeCount(),).toBe(2,);
  },);

  test("a self-dependency is rejected", async () => {
    const engine = new WorkflowDagEngine(testDb.db,);
    await expect(engine.addDependency("A", "A",)).rejects.toThrow(/cannot depend on itself/,);
    expect(await edgeCount(),).toBe(0,);
  },);

  test("a diamond is NOT mistaken for a cycle", async () => {
    const engine = new WorkflowDagEngine(testDb.db,);
    await engine.addDependency("B", "A",);
    await engine.addDependency("C", "A",);
    // D reached via B; adding D via C is a second, legal path.
    await engine.addDependency("D", "B",);
    await engine.addDependency("D", "C",);
    expect(await edgeCount(),).toBe(4,);
  },);
});


describe("WorkflowDagEngine — SQL injection surface", () => {
  // Node ids are caller-supplied and reach the DB, so this pins that
  // they are carried as VALUES, never concatenated into SQL text. A
  // payload that could rewrite a statement must land inert in the
  // task_id column and leave the table otherwise untouched.
  const INJECTION = ["A'; DROP TABLE task_dependencies; --", "B' OR 1=1 --", "`C`", "\"D\"",];

  test("hostile node ids are stored verbatim and do not alter the schema", async () => {
    const engine = new WorkflowDagEngine(testDb.db,);
    await engine.addDependency(INJECTION[1]!, INJECTION[0]!);

    const rows = await testDb.db.selectFrom("task_dependencies",).selectAll().execute();
    expect(rows,).toHaveLength(1,);
    // Round-trips byte-for-byte: the payload is data, not SQL.
    expect(rows[0]?.task_id,).toBe(INJECTION[1],);
    expect(rows[0]?.depends_on_task_id,).toBe(INJECTION[0],);
    // The table still exists with its columns — nothing was dropped.
    expect(engine.dependsOn(INJECTION[1]!,),).toEqual([INJECTION[0]!,],);
  },);

  test("an injection-shaped id cannot smuggle a cycle check past the engine", async () => {
    const engine = new WorkflowDagEngine(testDb.db,);
    await engine.addDependency("B", "A",);
    // The id contains quote and comment syntax; the reachability walk
    // must treat it as an opaque key, not parse it.
    const hostile = "A' --";
    await engine.addDependency(hostile, "B",);
    expect(engine.dependsOn(hostile,),).toEqual(["B",],);
    // And the real cycle A→B is still caught, unaffected by the odd key.
    await expect(engine.addDependency("A", "B",)).rejects.toThrow(/cycle rejected/,);
    expect(await edgeCount(),).toBe(2,);
  },);

  test("on_failure cannot carry SQL through the upsert conflict clause", async () => {
    const engine = new WorkflowDagEngine(testDb.db,);
    // A policy outside the CHECK domain is rejected by the constraint,
    // not spliced into the ON CONFLICT DO UPDATE clause.
    await expect(
      engine.addDependency("B", "A", "retry'; DROP TABLE task_dependencies; --" as never,),
    ).rejects.toThrow();
    const rows = await testDb.db.selectFrom("task_dependencies",).selectAll().execute();
    expect(rows,).toHaveLength(0,);
  },);
});

describe("WorkflowDagEngine — on_failure: skip", () => {
  test("a failed prerequisite skips its skip-policy dependents", async () => {
    const engine = new WorkflowDagEngine(testDb.db,);
    await engine.addDependency("B", "A", "skip",);

    const order: string[] = [];
    const result = await engine.runPass(
      registry(["A", boom("A", order,)], ["B", ok("B", order,)],),
      T0,
      RNG,
    );

    expect(result.failed,).toEqual(["A",],);
    expect(result.skipped,).toEqual(["B",],);
    expect(result.ran,).toEqual([],);
    expect(order,).toEqual(["A",],);
    expect(engine.statusMap().nodes["B"]?.state,).toBe("skipped",);
  },);

  test("skip cascades transitively", async () => {
    const engine = new WorkflowDagEngine(testDb.db,);
    await engine.addDependency("B", "A", "skip",);
    await engine.addDependency("C", "B", "skip",);

    const result = await engine.runPass(registry(["A", boom("A", [])],), T0, RNG,);

    // B is skipped by A's failure, and C by B's skip — C would
    // otherwise sit blocked behind a node that can never run.
    expect(result.skipped,).toEqual(["B", "C",],);
    expect(engine.statusMap().nodes["C"]?.state,).toBe("skipped",);
  },);
});

describe("WorkflowDagEngine — on_failure: retry", () => {
  test("a retry dependent is NOT skipped and stays blocked", async () => {
    const engine = new WorkflowDagEngine(testDb.db,);
    await engine.addDependency("B", "A", "retry",);

    const order: string[] = [];
    const result = await engine.runPass(
      registry(["A", boom("A", order,)], ["B", ok("B", order,)],),
      T0,
      RNG,
    );

    expect(result.failed,).toEqual(["A",],);
    expect(result.skipped,).toEqual([],);
    // B never ran, but it is not abandoned — it is waiting on A.
    expect(result.ran,).toEqual([],);
    expect(engine.statusMap().nodes["B"]?.state,).toBe("blocked",);
  },);

  test("a retry dependent runs once its prerequisite succeeds", async () => {
    const engine = new WorkflowDagEngine(testDb.db,);
    await engine.addDependency("B", "A", "retry",);

    let aFails = true;
    const tasks = registry(
      ["A", () => (aFails ? Promise.reject(new Error("A down",)) : Promise.resolve())],
      ["B", ok("B", [],)],
    );

    await engine.runPass(tasks, T0, RNG,);
    expect(engine.statusMap().nodes["B"]?.state,).toBe("blocked",);

    // A recovers; the retry edge now lets B through.
    aFails = false;
    engine.reset("A",);
    const second = await engine.runPass(tasks, T0 + 1, RNG,);

    expect(second.ran,).toEqual(["A", "B",],);
    expect(engine.statusMap().nodes["B"]?.state,).toBe("done",);
  },);

  test("a retry edge shields a downstream node from the skip cascade", async () => {
    const engine = new WorkflowDagEngine(testDb.db,);
    await engine.addDependency("B", "A", "retry",);
    await engine.addDependency("C", "B", "skip",);

    const result = await engine.runPass(registry(["A", boom("A", [])],), T0, RNG,);

    // B survives A's failure (retry), so the skip cascade never starts
    // and C is not abandoned on a prerequisite that may still recover.
    expect(result.skipped,).toEqual([],);
    expect(engine.statusMap().nodes["B"]?.state,).toBe("blocked",);
    expect(engine.statusMap().nodes["C"]?.state,).toBe("blocked",);
  },);
});

describe("WorkflowDagEngine — status surface", () => {
  test("statusMap reports every known node with state, error, and attempts", async () => {
    const engine = new WorkflowDagEngine(testDb.db,);
    await engine.addDependency("B", "A", "skip",);
    await engine.runPass(registry(["A", boom("A", [])],), T0, RNG,);

    const { nodes, } = engine.statusMap();

    // A failed and carries its error; B was skipped by the policy.
    expect(nodes["A"]?.state,).toBe("failed",);
    expect(nodes["A"]?.lastError,).toBe("A exploded",);
    expect(nodes["A"]?.attempts,).toBe(1,);
    expect(nodes["B"]?.state,).toBe("skipped",);
    expect(nodes["B"]?.lastError,).toBeNull();
    // B never ran, so it has no attempt and no error to report.
    expect(nodes["B"]?.attempts,).toBe(0,);
  },);

  test("a node with no registered body is reported blocked, not failed", async () => {
    const engine = new WorkflowDagEngine(testDb.db,);
    await engine.addDependency("B", "A",);

    // A has a body; B does not.
    const result = await engine.runPass(registry(["A", ok("A", [])],), T0, RNG,);

    expect(result.ran,).toEqual(["A",],);
    expect(result.failed,).toEqual([],);
    expect(result.blocked,).toEqual(["B",],);
    expect(engine.statusMap().nodes["B"]?.state,).toBe("blocked",);
  },);

  test("a node whose body throws is recorded, never propagated", async () => {
    const engine = new WorkflowDagEngine(testDb.db,);
    await engine.addDependency("B", "A", "retry",);

    // The rejection must not escape runPass — the scheduler's other
    // dispatch targets still have to run this tick.
    const result = await engine.runPass(
      registry(["A", boom("A", [])], ["B", ok("B", [])],),
      T0,
      RNG,
    );
    expect(result.failed,).toEqual(["A",],);
  },);

  test("attempts accumulate across passes for a re-run node", async () => {
    const engine = new WorkflowDagEngine(testDb.db,);
    let calls = 0;
    const tasks = registry(["A", () => {
      calls += 1;
      return calls === 1 ? Promise.reject(new Error("first try fails",)) : Promise.resolve();
    },],);

    await engine.runPass(tasks, T0, RNG,);
    expect(engine.statusMap().nodes["A"]?.attempts,).toBe(1,);

    engine.reset("A",);
    await engine.runPass(tasks, T0 + 1, RNG,);
    expect(engine.statusMap().nodes["A"]?.attempts,).toBe(2,);
    expect(engine.statusMap().nodes["A"]?.state,).toBe("done",);
  },);
});
