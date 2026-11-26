// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Owned resources: the apiFetch global is the only shared state. Each test
// installs its own mock and restores the original in `finally`, so tests are
// independent of order and can run alongside other admin suites.
import "./i18n.test-helper";
import { expect, test, } from "bun:test";
import type { ApiFetchMock, } from "../tests/test-types";
import {
  canCancelHarnessQueueTurn,
  createAdminHarnessQueue,
  harnessQueueErrorMessage,
  type HarnessQueueTurn,
} from "./admin-harness-queue";

const g = globalThis as unknown as { apiFetch?: ApiFetchMock };

interface RecordedCall {
  url: string;
  opts?: RequestInit;
}

/** Install a per-test fetch mock; always restores the previous global. */
async function withFetch<T,>(
  handler: ApiFetchMock,
  body: (calls: RecordedCall[],) => Promise<T> | T,
): Promise<T> {
  const original = g.apiFetch;
  const calls: RecordedCall[] = [];
  g.apiFetch = (url: string, opts?: RequestInit,) => {
    calls.push({ url, opts, },);
    return handler(url, opts,);
  };

  try {
    return await body(calls,);
  } finally {
    g.apiFetch = original;
  }
}

/** One queued row; ids are unique per test so parallel runs cannot collide. */
function queued(id: string,): HarnessQueueTurn {
  return {
    id,
    batchId: `batch-${id}`,
    profile: "omp",
    prompt: "hello",
    chatId: `chat-${id}`,
    actorId: `actor-${id}`,
    createdAt: "2026-11-22 10:00:00",
    status: "queued",
  };
}

test("cancel is offered only for queued turns", () => {
  expect(canCancelHarnessQueueTurn(queued("qf-guard-queued",),),).toBe(true,);
  for (const status of ["running", "completed", "failed", "cancelled",] as const) {
    expect(canCancelHarnessQueueTurn({ ...queued("qf-guard-other",), status, },),).toBe(false,);
  }
});

test("load lists turns from the read route", async () => {
  await withFetch(async () => Response.json({ items: [queued("qf-load-1",),], },), async (calls,) => {
    const state = createAdminHarnessQueue();
    await state.init();
    expect(calls.map((call,) => call.url),).toEqual(["/api/v1/harness/queue?limit=200",],);
    expect(state.rows.map((row,) => row.id),).toEqual(["qf-load-1",],);
    expect(state.error,).toBe("",);
    expect(state.loading,).toBe(false,);
  },);
});

test("load tolerates a response without an items array", async () => {
  await withFetch(async () => Response.json({},), async () => {
    const state = createAdminHarnessQueue();
    await state.init();
    expect(state.rows,).toEqual([],);
    expect(state.error,).toBe("",);
  },);
});

test("load maps a 403 to a message instead of crashing", async () => {
  await withFetch(async () => {
    throw Object.assign(new Error("Forbidden",), { status: 403, },);
  }, async () => {
    const state = createAdminHarnessQueue();
    await state.init();
    expect(state.error,).toBe("You do not have permission to use the harness queue.",);
    expect(state.rows,).toEqual([],);
    expect(state.loading,).toBe(false,);
  },);
});

test("load maps a 401 to a message instead of crashing", async () => {
  await withFetch(async () => {
    throw new Error("Unauthorized",);
  }, async () => {
    const state = createAdminHarnessQueue();
    await state.init();
    expect(state.error,).toBe("Your session is not authorized for the harness queue.",);
    expect(state.rows,).toEqual([],);
  },);
});

test("load shows the server reason for another failure", async () => {
  await withFetch(async () => {
    throw Object.assign(new Error("boom",), { status: 500, body: { error: "queue not composed", }, },);
  }, async () => {
    const state = createAdminHarnessQueue();
    await state.init();
    expect(state.error,).toBe("queue not composed",);
  },);
});

test("enqueue posts one turn and reloads the list", async () => {
  await withFetch(async (url,) =>
    url.includes("/harness/queue?",)
      ? Response.json({ items: [queued("qf-enqueue-1",),], },)
      : Response.json({ batchId: "batch-qf", turnIds: ["qf-enqueue-1",], },), async (calls,) => {
    const state = createAdminHarnessQueue();
    state.profile = "omp";
    state.prompt = "  hello  ";
    state.chatId = "chat-qf-enqueue-1";
    state.actorId = "actor-qf-enqueue-1";
    await state.enqueue();
    expect(calls.map((call,) => call.url),).toEqual([
      "/api/v1/harness/queue",
      "/api/v1/harness/queue?limit=200",
    ],);

    expect(calls[0]!.opts?.method,).toBe("POST",);
    expect(JSON.parse(String(calls[0]!.opts?.body,),),).toEqual({
      turns: [{
        profile: "omp",
        prompt: "hello",
        chatId: "chat-qf-enqueue-1",
        actorId: "actor-qf-enqueue-1",
      },],
    },);

    expect(state.message,).toBe("Turn enqueued.",);
    expect(state.prompt,).toBe("",);
    expect(state.submitting,).toBe(false,);
  },);
});

test("enqueue refuses an incomplete form without a request", async () => {
  await withFetch(async () => {
    throw new Error("should not be called",);
  }, async (calls,) => {
    const state = createAdminHarnessQueue();
    await state.enqueue();
    expect(calls,).toEqual([],);
    expect(state.error,).toBe("Profile, prompt, chat ID and actor ID are all required.",);
  },);
});

test("enqueue shows its own fallback on a reasonless failure", async () => {
  await withFetch(async () => {
    throw Object.assign(new Error("network down",), { status: 500, },);
  }, async () => {
    const state = createAdminHarnessQueue();
    state.profile = "omp";
    state.prompt = "hello";
    state.chatId = "chat-qf-enqueue-fail";
    state.actorId = "actor-qf-enqueue-fail";
    await state.enqueue();
    expect(state.error,).toBe("Failed to enqueue the turn.",);
    expect(state.submitting,).toBe(false,);
  },);
});

test("cancel posts to the turn route and reloads", async () => {
  await withFetch(async (url,) =>
    url.includes("/turns/",)
      ? Response.json({ ok: true, },)
      : Response.json({ items: [], },), async (calls,) => {
    const state = createAdminHarnessQueue();
    state.rows = [queued("qf-cancel-1",),];
    await state.cancel("qf-cancel-1",);
    expect(calls.map((call,) => call.url),).toEqual([
      "/api/v1/harness/queue/turns/qf-cancel-1/cancel",
      "/api/v1/harness/queue?limit=200",
    ],);

    expect(calls[0]!.opts?.method,).toBe("POST",);
    expect(state.message,).toBe("Turn cancelled.",);
    expect(state.cancellingId,).toBe(null,);
  },);
});

test("cancel refuses a running turn without a request", async () => {
  await withFetch(async () => {
    throw new Error("should not be called",);
  }, async (calls,) => {
    const state = createAdminHarnessQueue();
    state.rows = [{ ...queued("qf-cancel-running",), status: "running", },];
    await state.cancel("qf-cancel-running",);
    expect(calls,).toEqual([],);
    expect(state.rows[0]!.status,).toBe("running",);
  },);
});

test("cancel keeps a 409 conflict as an error state", async () => {
  await withFetch(async () => {
    throw Object.assign(new Error("Conflict",), {
      status: 409,
      body: { message: "only a queued turn can be cancelled", },
    },);
  }, async (calls,) => {
    const state = createAdminHarnessQueue();
    state.rows = [queued("qf-cancel-conflict",),];
    await state.cancel("qf-cancel-conflict",);
    expect(calls,).toHaveLength(1,);
    expect(state.error,).toBe("only a queued turn can be cancelled",);
    expect(state.cancellingId,).toBe(null,);
  },);
});

test("the error helper keeps its status vocabulary", () => {
  expect(harnessQueueErrorMessage({ status: 403, }, "harnessQueue.loadFailed",),).toBe(
    "You do not have permission to use the harness queue.",
  );

  expect(harnessQueueErrorMessage(new Error("Unauthorized",), "harnessQueue.loadFailed",),).toBe(
    "Your session is not authorized for the harness queue.",
  );

  expect(harnessQueueErrorMessage(new Error("down",), "harnessQueue.loadFailed",),).toBe(
    "Failed to load harness turns.",
  );
});

test("the component is registered globally for the panel partial", () => {
  expect((globalThis as unknown as Record<string, unknown>).adminHarnessQueue,).toBe(
    createAdminHarnessQueue,
  );
});
