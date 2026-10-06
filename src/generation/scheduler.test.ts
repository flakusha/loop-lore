// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Scheduler seam: real dispatch path through ResourceManager.

import { describe, expect, test, } from "bun:test";
import { CancelReason, CancelSource, } from "../db/enums";
import { PriorityLevel, ResourceManager, } from "../llm";
import { GenerationCancelledError, } from "./cancellation-actions/error";
import type { GenerateResponse, } from "./providers/types";
import { dispatchThroughScheduler, scheduledCallWithFailover, } from "./scheduler";

const usage = { promptTokens: 1, completionTokens: 1, totalTokens: 2, };

function ok(content = "hi",): GenerateResponse {
  return { content, finishReason: "stop", usage, };
}

function providerList(name = "p", impl?: (req: unknown,) => Promise<GenerateResponse>,) {
  return [{
    name,
    provider: { complete: impl ?? (async () => ok()), },
  },] as never;
}

function req(signal?: AbortSignal,) {
  return { model: "m", messages: [], params: {}, ...(signal ? { signal, } : {}), } as never;
}

describe("scheduler seam", () => {
  test("routes through the manager with primary key + Normal priority", async () => {
    const mgr = new ResourceManager({ defaultMax: 8, },);
    const failover = providerList();
    const seen: { providers: { name: string }[] }[] = [];
    const res = await scheduledCallWithFailover({
      id: "att-1:round-0",
      failoverList: failover,
      req: req(),
      scheduler: mgr,
      call: (async (providers: unknown, _r: unknown,) => {
        seen.push({ providers: providers as { name: string }[], },);
        return ok();
      }) as never,
    },);

    expect(res.content,).toBe("hi",);
    expect(seen[0]?.providers[0]?.name,).toBe("p",);
    expect(mgr.inFlight,).toBe(0,);
  });

  test("failover stays inside the slot (primary first, fallback next)", async () => {
    const mgr = new ResourceManager({ defaultMax: 8, },);
    const failover = [
      { name: "primary", provider: {}, },
      { name: "fallback", provider: {}, },
    ] as never;

    const order: string[] = [];
    const res = await scheduledCallWithFailover({
      id: "att-2:round-0",
      failoverList: failover,
      req: req(),
      scheduler: mgr,
      call: (async (providers: unknown,) => {
        for (const p of providers as { name: string }[]) { order.push(p.name,); }
        return ok("fallback-win",);
      }) as never,
    },);

    expect(res.content,).toBe("fallback-win",);
    expect(order,).toEqual(["primary", "fallback",],);
  });

  test("N concurrent Normal requests keep submission order (idle policy)", async () => {
    const mgr = new ResourceManager({ defaultMax: 32, },);
    const done: string[] = [];
    const jobs = Array.from({ length: 6, }, (_, i,) =>
      scheduledCallWithFailover({
        id: `att-n:${i}`,
        failoverList: providerList(),
        req: req(),
        scheduler: mgr,
        priority: PriorityLevel.Normal,
        call: (async () => {
          done.push(`r${i}`,);
          return ok(`v${i}`,);
        }) as never,
      },),);

    const out = await Promise.all(jobs,);
    expect(out.map((r,) => r.content),).toEqual(["v0", "v1", "v2", "v3", "v4", "v5",],);
    expect(done.length,).toBe(6,);
  });

  test("abort before slot acquisition rejects, never hangs", async () => {
    const mgr = new ResourceManager({ defaultMax: 1, },);
    const blocker = mgr.submit<string>({
      id: "blocker",
      provider: "p",
      priority: PriorityLevel.Normal,
      run: () => new Promise<string>((r,) => setTimeout(() => r("b",), 50,)),
    },);

    const controller = new AbortController();
    const pending = scheduledCallWithFailover({
      id: "queued",
      failoverList: providerList(),
      req: req(controller.signal,),
      scheduler: mgr,
      call: (async () => ok()) as never,
    },);

    controller.abort(new GenerationCancelledError(CancelReason.UserCancel, CancelSource.User, "stop",),);
    await expect(pending,).rejects.toBeInstanceOf(GenerationCancelledError,);
    await blocker.result;
  });

  test("signal already aborted at submit still invokes the provider", async () => {
    const mgr = new ResourceManager({ defaultMax: 8, },);
    const controller = new AbortController();
    controller.abort(new GenerationCancelledError(CancelReason.UserCancel, CancelSource.User, "early",),);

    let calls = 0;
    let sawAbort = false;
    const res = await scheduledCallWithFailover({
      id: "pre-aborted",
      failoverList: providerList(),
      req: req(controller.signal,),
      scheduler: mgr,
      call: (async (_providers: unknown, r: { signal?: AbortSignal },) => {
        calls++;
        sawAbort = r.signal?.aborted === true;
        return { ...ok(), finishReason: "cancelled", };
      }) as never,
    },);

    // The provider MUST run: stream-to-client relies on that call to register
    // activeGenerations and emit the cancelled done frame. Cancelling the queued
    // handle instead left calls=0 and the abort unobservable.
    expect(calls,).toBe(1,);
    expect(sawAbort,).toBe(true,);
    expect(res.finishReason,).toBe("cancelled",);
    expect(mgr.inFlight,).toBe(0,);
  });

  test("dispatchThroughScheduler uses injected dispatch", async () => {
    const dispatched: string[] = [];
    const res = await dispatchThroughScheduler(
      { callWithFailover: (async () => ok()) as never, },
      {
        id: "test-1",
        failoverList: providerList(),
        req: req(),
        dispatch: (async (opts: { id: string },) => {
          dispatched.push(opts.id,);
          return ok("dispatched",);
        }) as never,
      },
    );

    expect(res.content,).toBe("dispatched",);
    expect(dispatched,).toEqual(["test-1",],);
  });
});
