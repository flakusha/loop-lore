// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route tests for the harness turn queue surface
 * (TASK-harness-multi-agent-turn-queue): the admin guard denies non-admins,
 * an uncomposed queue reads 503 (the surface is inert when the integration
 * is disabled), and enqueue/list/cancel round-trip the queue service.
 *
 * Resource contract: ONE in-memory migrated DB per test (its own
 * user/actor/chat rows), a stub dispatch seam whose turns the test settles
 * by hand (no sleeps), the queue singleton reset around every test. No
 * ports, no subprocesses, no cross-test state — order-independent under the
 * parallel runner.
 */
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { Elysia, } from "elysia";
import { type DispatchHarnessTurnOptions, type DispatchHarnessTurnOutcome, } from "../../integrations/harness/dispatch";
import {
  getHarnessTurnQueue,
  type HarnessQueueDispatch,
  initHarnessTurnQueue,
  resetHarnessTurnQueue,
} from "../../integrations/harness/queue";
import { type HarnessRuntime, } from "../../integrations/harness/runtime";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { insertActors, } from "../../test-utils/insert-helpers";
import { harnessQueueRoutes, } from "./queue";

/** The runtime is only an enqueue-time gate here; the stub never reads it. */
const FAKE_RUNTIME = {} as HarnessRuntime;

/** Fixed fixture ids — one set of FK rows per test DB. */
const USER_ID = "user-queue-routes";
const ACTOR_ID = "actor-queue-routes";
const CHAT_ID = "chat-queue-routes";

let fixture: TestDb;

/** A dispatch stub whose in-flight turns the test settles by hand. */
function stubDispatch(): {
  dispatch: HarnessQueueDispatch;
  calls: DispatchHarnessTurnOptions[];
  settle: (prompt: string, messageId: string,) => void;
} {
  const calls: DispatchHarnessTurnOptions[] = [];
  const gates = new Map<string, (verdict: Promise<DispatchHarnessTurnOutcome>,) => void>();
  const dispatch: HarnessQueueDispatch = (options,) => {
    calls.push(options,);
    return new Promise<DispatchHarnessTurnOutcome>((resolve, reject,) => {
      gates.set(options.prompt, (verdict,) => verdict.then(resolve, reject,),);
    },);
  };

  return {
    dispatch,
    calls,
    settle(prompt, messageId,) {
      gates.get(prompt,)!(Promise.resolve({ turn: {} as DispatchHarnessTurnOutcome["turn"], messageId, },),);
    },
  };
}

/** Compose the queue SINGLETON over the fixture with a stubbed dispatch. */
function composeQueue(dispatch: HarnessQueueDispatch, maxConcurrent?: number,): void {
  resetHarnessTurnQueue();
  initHarnessTurnQueue({
    database: fixture.db,
    runtime: () => FAKE_RUNTIME,
    dispatch,
    ...(maxConcurrent === undefined ? {} : { maxConcurrent, }),
  },);
}

/** Mount the routes on a fresh app with a fixed principal. */
function app(role: string | null,) {
  return new Elysia()
    .derive(() => ({ userId: USER_ID, userRole: role, }))
    .use(harnessQueueRoutes(),);
}

/** Hit a path on a fresh mounted app. */
function hit(role: string | null, method: string, path: string, body?: unknown,): Promise<Response> {
  return app(role,).handle(
    new Request(`http://localhost${path}`, {
      method,
      ...(body === undefined ? {} : {
        headers: { "content-type": "application/json", },
        body: JSON.stringify(body,),
      }),
    },),
  );
}

/** A one-turn enqueue body against the fixture chat. */
function bodyWith(prompt: string,): { turns: { profile: string; prompt: string; chatId: string; actorId: string }[] } {
  return { turns: [{ profile: "omp", prompt, chatId: CHAT_ID, actorId: ACTOR_ID, },], };
}

/** One macro-task turn: flushes the claim chain (microtasks) exactly once. */
async function flush(): Promise<void> {
  await new Promise<void>((resolve,) => setImmediate(resolve,));
}

beforeEach(async () => {
  fixture = await createTestDb();

  await fixture.db.insertInto("users",).values({
    id: USER_ID,
    username: "queue-routes",
    display_name: "Queue Routes",
    role: "solo",
    status: "active",
    settings: "{}",
  },).execute();

  await insertActors(fixture.db, "Alice", {
    id: ACTOR_ID,
    actor_type: "character",
    owner_id: USER_ID,
    agent_type: "ai",
    settings: "{}",
    import_spec: "raw",
    data_source_format: "json",
    data_raw: null,
  } as never,);

  await fixture.db.insertInto("chats",).values({
    id: CHAT_ID,
    name: "Queue Routes",
    type: "direct",
    mode: "direct",
    created_by: USER_ID,
    max_turns: null,
  } as never,).execute();
},);

afterEach(async () => {
  resetHarnessTurnQueue();
  await destroyTestDb(fixture,);
},);

describe("harnessQueueRoutes", () => {
  describe("authz", () => {
    it("denies a non-admin on every endpoint", async () => {
      composeQueue(stubDispatch().dispatch,);
      for (const role of ["user", "viewer", null,]) {
        const list = await hit(role, "GET", "/api/v1/harness/queue",);
        expect(list.status,).toBe(403,);

        const enqueue = await hit(role, "POST", "/api/v1/harness/queue", bodyWith("denied",),);
        expect(enqueue.status,).toBe(403,);

        const cancel = await hit(role, "POST", "/api/v1/harness/queue/turns/some-id/cancel",);
        expect(cancel.status,).toBe(403,);
      }
    });
  });

  describe("not composed", () => {
    it("reads 503 on every endpoint when the queue is not composed", async () => {
      expect(getHarnessTurnQueue(),).toBeNull();
      for (
        const res of [
          await hit("admin", "GET", "/api/v1/harness/queue",),
          await hit("admin", "POST", "/api/v1/harness/queue", bodyWith("inert",),),
          await hit("admin", "POST", "/api/v1/harness/queue/turns/some-id/cancel",),
        ]
      ) {
        expect(res.status,).toBe(503,);
      }
    });
  });

  describe("enqueue + list", () => {
    it("enqueues a batch and lists its turns", async () => {
      const stub = stubDispatch();
      composeQueue(stub.dispatch,);

      const res = await hit("admin", "POST", "/api/v1/harness/queue", bodyWith("listed",),);
      expect(res.status,).toBe(200,);
      const enqueued = await res.json() as { batchId: string; turnIds: string[] };
      expect(enqueued.turnIds,).toHaveLength(1,);

      // The turn runs under the request's principal — after one event-loop
      // turn (the pump is fired-and-forgotten inside the handler).
      await flush();
      expect(stub.calls,).toHaveLength(1,);
      expect(stub.calls[0]?.userId,).toBe(USER_ID,);
      expect(stub.calls[0]?.role,).toBe("admin",);

      await flush();
      const list = await hit("admin", "GET", "/api/v1/harness/queue",);
      expect(list.status,).toBe(200,);
      const { items, } = await list.json() as {
        items: { id: string; status: string; profile: string; batchId: string }[];
      };

      expect(items,).toHaveLength(1,);
      expect(items[0],).toMatchObject({
        id: enqueued.turnIds[0],
        status: "running",
        profile: "omp",
        batchId: enqueued.batchId,
      },);
    });

    it("rejects an empty batch with 400", async () => {
      composeQueue(stubDispatch().dispatch,);
      const res = await hit("admin", "POST", "/api/v1/harness/queue", { turns: [], },);
      expect(res.status,).toBe(400,);
    });

    it("scopes the listing to ?batchId=", async () => {
      const stub = stubDispatch();
      composeQueue(stub.dispatch,);

      const firstRes = await hit("admin", "POST", "/api/v1/harness/queue", bodyWith("one",),);
      const first = await firstRes.json() as { batchId: string };
      const secondRes = await hit("admin", "POST", "/api/v1/harness/queue", bodyWith("two",),);
      const second = await secondRes.json() as { batchId: string };
      expect(first.batchId,).not.toBe(second.batchId,);

      // The claims must exist before the gates can be settled.
      await flush();

      const list = await hit("admin", "GET", `/api/v1/harness/queue?batchId=${first.batchId}`,);
      const { items, } = await list.json() as { items: { prompt: string }[] };
      expect(items,).toHaveLength(1,);
      expect(items[0]?.prompt,).toBe("one",);

      // "two" rides the SAME profile, so it stays queued behind "one" (the
      // per-profile lock, not the global cap) — it never dispatches, so only
      // "one" has a gate to settle.
      stub.settle("one", "m1",);
    });
  });

  describe("cancel", () => {
    it("404s an unknown turn, 409s a running one, 200s a queued one", async () => {
      const stub = stubDispatch();
      composeQueue(stub.dispatch, 1,);

      const res = await hit("admin", "POST", "/api/v1/harness/queue", {
        turns: [
          { profile: "omp", prompt: "head", chatId: CHAT_ID, actorId: ACTOR_ID, },
          { profile: "omp", prompt: "tail", chatId: CHAT_ID, actorId: ACTOR_ID, },
        ],
      },);

      const { turnIds, } = await res.json() as { turnIds: string[] };
      await flush();

      const missing = await hit("admin", "POST", "/api/v1/harness/queue/turns/no-such/cancel",);
      expect(missing.status,).toBe(404,);

      // Cap 1: "head" claimed (running), "tail" queued — the running turn
      // has a live harness process behind it and cannot be cancelled.
      const running = await hit("admin", "POST", `/api/v1/harness/queue/turns/${turnIds[0]}/cancel`,);
      expect(running.status,).toBe(409,);

      const queued = await hit("admin", "POST", `/api/v1/harness/queue/turns/${turnIds[1]}/cancel`,);
      expect(queued.status,).toBe(200,);
      // jsonResponse wraps the data with the API-version meta envelope.
      expect(await queued.json(),).toMatchObject({ ok: true, },);

      stub.settle("head", "m1",);
    });
  });
});
