// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Workflow → plan-item bridge tests (epic-assistant-step-planning).
 *
 * The bridge is best-effort by contract — it mirrors a workflow run into
 * `plan_items` keyed by `chat_id = "workflow:<id>"`, and it must never throw
 * at the caller. Both halves are pinned here: the mirroring rules (one item
 * per step, idempotency, filled-step advance, owner scoping) AND the swallow
 * that hides failures.
 *
 * BUG-workflow-bridge-chat-fk (found while writing these tests): the bridge
 * writes `chat_id = "workflow:<id>"`, but `plan_items.chat_id` REFERENCES
 * `chats.id`. Unless a chats row literally carries that pseudo-id, every
 * `service.create` raises FOREIGN KEY constraint failed, the blanket `catch`
 * swallows it, and the bridge silently creates NOTHING. That is why these
 * tests provision the pseudo-chat row first — and why the "swallows the FK
 * failure" test below is load-bearing rather than defensive boilerplate.
 * No production caller invokes the bridge yet, so the bug is latent.
 *
 * Second quirk, pinned deliberately: the create branch and the advance branch
 * are mutually exclusive (`if (!existingId) … else if (hasValue) …`). A step
 * filled on the very FIRST emit is created straight to `todo` — the advance
 * only happens once the item already exists, i.e. from the second emit on.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { WorkflowRun, } from "../assistant/workflow-runner";
import type { AssistantWorkflowConfig, } from "../config/sections/templates";
import { PlanItemKind, PlanItemState, } from "../db/enums-story/plans";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertChats, insertPlanItems, insertUsers, } from "../test-utils/insert-helpers";
import { createPlanningService, } from "./service";
import { emitWorkflowPlanSteps, } from "./workflow-bridge";

function workflow(id: string, stepNames: string[],): AssistantWorkflowConfig {
  return {
    id,
    name: `WF ${id}`,
    steps: stepNames.map((name, i,) => ({
      id: `s${i + 1}`,
      name,
      type: "text" as const,
      recommendations: [],
      formatTemplate: "{value}",
    })),
    dispatch: { backend: "test", target: "/api/test", payloadTemplate: {}, },
  };
}

function run(workflowId: string, values: Record<string, string | string[]> = {},): WorkflowRun {
  return { workflowId, values, confirmed: false, };
}

describe("emitWorkflowPlanSteps", () => {
  let db: Kysely<DB>;
  let ownerId: string;

  /** Provision the `workflow:<id>` chats row the FK demands. */
  const pseudoChat = (id: string,) => insertChats(db, `Workflow ${id}`, ownerId, { id: `workflow:${id}`, },);

  beforeAll(async () => {
    ({ db, } = await createTestDb());
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  beforeEach(async () => {
    await db.deleteFrom("plan_links",).execute();
    await db.deleteFrom("plan_items",).execute();
    await db.deleteFrom("chats",).execute();
    await db.deleteFrom("users",).execute();
    ownerId = `user-${crypto.randomUUID()}`;
    await insertUsers(db, `owner-${ownerId}`, "Owner", { id: ownerId, },);
  },);

  test("creates one todo plan item per step, in step order", async () => {
    await pseudoChat("wf1",);
    await emitWorkflowPlanSteps(db, workflow("wf1", ["Outline", "Draft", "Review",],), run("wf1",), ownerId,);

    const service = createPlanningService(db,);
    const items = await service.list(ownerId, "workflow:wf1",);
    expect(items.map((i,) => i.title),).toEqual(["Outline", "Draft", "Review",],);
    expect(items.map((i,) => i.position),).toEqual([0, 1, 2,],);
    expect(items.every((i,) => i.state === PlanItemState.Todo),).toBe(true,);
    expect(items.every((i,) => i.kind === PlanItemKind.Step),).toBe(true,);
  });

  test("a filled step advances its existing item to doing on the next emit", async () => {
    const wf = workflow("wf2", ["Outline", "Draft",],);
    await pseudoChat("wf2",);
    await emitWorkflowPlanSteps(db, wf, run("wf2",), ownerId,);
    // second emit, this time with a value for step 1
    await emitWorkflowPlanSteps(db, wf, run("wf2", { s1: "a synopsis", },), ownerId,);

    const service = createPlanningService(db,);
    const items = await service.list(ownerId, "workflow:wf2",);
    expect(items,).toHaveLength(2,);
    expect(items.find((i,) => i.title === "Outline")!.state,).toBe(PlanItemState.Doing,);
    expect(items.find((i,) => i.title === "Draft")!.state,).toBe(PlanItemState.Todo,);
  });

  test("a step filled on the first emit is created as todo, not advanced", async () => {
    // The create and advance branches are mutually exclusive — a brand-new
    // item is always born todo even when its step already has a value.
    const wf = workflow("wf2b", ["A", "B",],);
    await pseudoChat("wf2b",);
    await emitWorkflowPlanSteps(db, wf, run("wf2b", { s1: "x", },), ownerId,);

    const items = await createPlanningService(db,).list(ownerId, "workflow:wf2b",);
    expect(items,).toHaveLength(2,);
    expect(items.every((i,) => i.state === PlanItemState.Todo),).toBe(true,);

    // …and the next emit advances exactly the filled one.
    await emitWorkflowPlanSteps(db, wf, run("wf2b", { s1: "x", },), ownerId,);
    const after = await createPlanningService(db,).list(ownerId, "workflow:wf2b",);
    expect(after.find((i,) => i.title === "A")!.state,).toBe(PlanItemState.Doing,);
    expect(after.find((i,) => i.title === "B")!.state,).toBe(PlanItemState.Todo,);
  });

  test("is idempotent — a repeat emit creates no duplicate rows", async () => {
    const wf = workflow("wf3", ["One", "Two",],);
    await pseudoChat("wf3",);
    await emitWorkflowPlanSteps(db, wf, run("wf3",), ownerId,);
    await emitWorkflowPlanSteps(db, wf, run("wf3",), ownerId,);
    await emitWorkflowPlanSteps(db, wf, run("wf3",), ownerId,);
    expect(await createPlanningService(db,).list(ownerId, "workflow:wf3",),).toHaveLength(2,);
  });

  test("an already-doing item is not re-advanced (todo guard holds)", async () => {
    const wf = workflow("wf4", ["Alpha",],);
    await pseudoChat("wf4",);
    await emitWorkflowPlanSteps(db, wf, run("wf4",), ownerId,);
    await emitWorkflowPlanSteps(db, wf, run("wf4", { s1: "filled", },), ownerId,);

    const service = createPlanningService(db,);
    expect((await service.list(ownerId, "workflow:wf4",))[0]!.state,).toBe(PlanItemState.Doing,);
    // fill again — must stay doing, not blow up on doing → doing
    await emitWorkflowPlanSteps(db, wf, run("wf4", { s1: "refilled", },), ownerId,);
    expect((await service.list(ownerId, "workflow:wf4",))[0]!.state,).toBe(PlanItemState.Doing,);
  });

  test("scopes plan items to the emitting owner", async () => {
    const otherId = `user-${crypto.randomUUID()}`;
    await insertUsers(db, `other-${otherId}`, "Other", { id: otherId, },);
    await pseudoChat("wf5",);
    await emitWorkflowPlanSteps(db, workflow("wf5", ["Shared Name",],), run("wf5",), ownerId,);
    expect(await createPlanningService(db,).list(otherId, "workflow:wf5",),).toHaveLength(0,);
  });

  test("a pre-existing item with the same title is adopted, not duplicated", async () => {
    await pseudoChat("wf6",);
    await insertPlanItems(db, ownerId, "Outline", { chat_id: "workflow:wf6", position: 9, },);
    await emitWorkflowPlanSteps(db, workflow("wf6", ["Outline",],), run("wf6",), ownerId,);

    const items = await createPlanningService(db,).list(ownerId, "workflow:wf6",);
    expect(items,).toHaveLength(1,);
    expect(items[0]!.position,).toBe(9,); // the pre-existing row won
  });

  test("a workflow with no steps is a no-op", async () => {
    await pseudoChat("wf8",);
    await emitWorkflowPlanSteps(db, workflow("wf8", [],), run("wf8",), ownerId,);
    expect(await createPlanningService(db,).list(ownerId, "workflow:wf8",),).toHaveLength(0,);
  });

  // ── The documented swallow, pinned ─────────────────────────
  //
  // "never break workflow" means the caller sees nothing when the DB rejects
  // the write. Pinned in both forms so the guarantee cannot regress into
  // either a thrown error or a silently-lost sync that looks like success.

  test("never throws when the database rejects the read", async () => {
    const broken = {
      selectFrom() {
        throw new Error("db is down",);
      },
      // `as unknown as Kysely<DB>`: only selectFrom is exercised; the rest of
      // the driver is unreachable behind the deliberate throw.
    } as unknown as Kysely<DB>;

    await emitWorkflowPlanSteps(broken, workflow("wf7", ["Step",],), run("wf7",), ownerId,);
  });

  test("swallows the FK failure when the workflow pseudo-chat is absent", async () => {
    // No pseudoChat("wf9") here — this is the live BUG-workflow-bridge-chat-fk
    // path. The bridge must still not throw at its caller.
    await emitWorkflowPlanSteps(db, workflow("wf9", ["Step",],), run("wf9",), ownerId,);
    expect(await createPlanningService(db,).list(ownerId, "workflow:wf9",),).toHaveLength(0,);
  });
});
