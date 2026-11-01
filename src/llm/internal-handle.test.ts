import { describe, expect, test, } from "bun:test";
import { createInternalHandle, isSchedulerCancel, } from "./internal-handle";
import type { ScheduledRequest, } from "./resource-manager-types";

/**
 * @param id
 * @returns minimal scheduled request for handle construction
 */
function makeReq(id: string,): ScheduledRequest<string> {
  return { id, provider: "test", priority: 100, run: () => Promise.resolve("ran",), };
}

/**
 * Await a promise expected to reject and return the rejection reason.
 * Attaching the handler here also keeps bun's unhandled-rejection guard quiet.
 * @param promise
 * @returns the rejection reason
 */
async function rejectionOf(promise: Promise<string>,): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }

  throw new Error("expected the promise to reject",);
}

describe("createInternalHandle — settle semantics", () => {
  test("resolve() settles the result and reports complete state", async () => {
    const h = createInternalHandle(makeReq("r1",),);
    expect(h.result,).toBe(h.result,); // stable promise identity
    h.resolve("v",);
    expect(await h.result,).toBe("v",);
    expect(h.state,).toBe("complete",);
    expect(h.isCancelled(),).toBe(false,);
  });

  test("reject() rejects the promise; the state is 'complete' (no failed state)", async () => {
    const h = createInternalHandle(makeReq("r2",),);
    const failure = new Error("provider down",);
    h.reject(failure,);
    expect(await rejectionOf(h.result,),).toBe(failure,);
    expect(h.state,).toBe("complete",);
  });

  test("cancel() rejects with the prefixed scheduler message and flags cancelled", async () => {
    const h = createInternalHandle(makeReq("r3",),);
    h.cancel("user navigated away",);
    const err = await rejectionOf(h.result,);
    expect((err as Error).message,).toBe("schedule cancelled: user navigated away",);
    expect(h.state,).toBe("cancelled",);
    expect(h.isCancelled(),).toBe(true,);
  });

  test("cancel() without a reason uses the default 'cancelled' reason", async () => {
    const h = createInternalHandle(makeReq("r4",),);
    h.cancel();
    const err = await rejectionOf(h.result,);
    expect((err as Error).message,).toBe("schedule cancelled: cancelled",);
  });

  test("resolve() after cancel() does not overwrite the rejection", async () => {
    const h = createInternalHandle(makeReq("r5",),);
    h.cancel("gone",);
    h.resolve("late",);
    const err = await rejectionOf(h.result,);
    expect((err as Error).message,).toBe("schedule cancelled: gone",);
    expect(h.state,).toBe("cancelled",);
    expect(h.isCancelled(),).toBe(true,);
  });

  test("cancel() after resolve() is a no-op — first settle wins", async () => {
    const h = createInternalHandle(makeReq("r6",),);
    h.resolve("v",);
    h.cancel("late",);
    expect(await h.result,).toBe("v",);
    expect(h.state,).toBe("complete",);
    expect(h.isCancelled(),).toBe(false,);
  });

  test("double resolve() keeps the first value", async () => {
    const h = createInternalHandle(makeReq("r7",),);
    h.resolve("first",);
    h.resolve("second",);
    expect(await h.result,).toBe("first",);
  });

  test("cancel() is idempotent — the first reason is preserved", async () => {
    const h = createInternalHandle(makeReq("r8",),);
    h.cancel("first reason",);
    h.cancel("second reason",);
    const err = await rejectionOf(h.result,);
    expect((err as Error).message,).toBe("schedule cancelled: first reason",);
  });
});

describe("createInternalHandle — onSettled single-shot guard", () => {
  test("fires exactly once across settle and manager nudges", () => {
    const h = createInternalHandle(makeReq("r9",),);
    let fired = 0;
    h.onSettled = () => {
      fired++;
    };

    h.resolve("v",);
    h.notifySettled();
    h.notifySettled();
    expect(fired,).toBe(1,);
  });

  test("fires once for cancellation too, even with extra nudges", async () => {
    const h = createInternalHandle(makeReq("r10",),);
    let fired = 0;
    h.onSettled = () => {
      fired++;
    };

    h.cancel("x",);
    h.notifySettled();
    expect(fired,).toBe(1,);
    await rejectionOf(h.result,);
  });

  // Intentional per the module comment: the guard is consumed by the first
  // settle, so a late subscriber is never invoked — the manager must attach
  // onSettled before dispatch.
  test("onSettled assigned after settle never fires", () => {
    const h = createInternalHandle(makeReq("r11",),);
    h.resolve("v",);
    let fired = 0;
    h.onSettled = () => {
      fired++;
    };

    h.notifySettled();
    expect(fired,).toBe(0,);
  });
});

describe("createInternalHandle — transition stickiness", () => {
  test("cancelled is sticky: later transitions cannot resurrect the request", async () => {
    const h = createInternalHandle(makeReq("r12",),);
    const settled = rejectionOf(h.result,);
    h.cancel("x",);
    h.transition("running",);
    expect(h.state,).toBe("cancelled",);
    await settled;
  });

  test("queued → running → complete transitions stay allowed before settling", async () => {
    const h = createInternalHandle(makeReq("r13",),);
    h.transition("running",);
    expect(h.state,).toBe("running",);
    h.resolve("v",);
    expect(h.state,).toBe("complete",);
    expect(await h.result,).toBe("v",);
  });
});

describe("isSchedulerCancel", () => {
  test("classifies real handle cancellations", async () => {
    const h = createInternalHandle(makeReq("r14",),);
    h.cancel("slot lost",);
    const err = await rejectionOf(h.result,);
    expect(isSchedulerCancel(err,),).toBe(true,);
  });

  test("matches the exact message prefix, nothing looser", () => {
    expect(isSchedulerCancel(new Error("schedule cancelled: any reason",),),).toBe(true,);
    expect(isSchedulerCancel(new Error("schedule cancelled: ",),),).toBe(true,);
    expect(isSchedulerCancel(new Error("schedule cancelled",),),).toBe(false,); // missing ": "
    expect(isSchedulerCancel(new Error("schedule cancelled:x",),),).toBe(false,); // missing space
    expect(isSchedulerCancel(new Error("provider failed: schedule cancelled: x",),),).toBe(false,);
  });

  test("rejects non-Error reasons and accepts Error subclasses", () => {
    expect(isSchedulerCancel("schedule cancelled: spoofed",),).toBe(false,);
    expect(isSchedulerCancel(null,),).toBe(false,);
    expect(isSchedulerCancel(undefined,),).toBe(false,);
    expect(isSchedulerCancel({ message: "schedule cancelled: x", },),).toBe(false,);

    class ProviderCancelError extends Error {}
    expect(isSchedulerCancel(new ProviderCancelError("schedule cancelled: x",),),).toBe(true,);
  });
});
