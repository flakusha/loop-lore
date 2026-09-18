// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { PriorityLevel, ResourceManager, type ScheduledRequest, } from "./resource-manager";

const sleep = (ms: number,): Promise<void> => new Promise((r,) => setTimeout(r, ms,));

function makeExec(value: string, delay = 5,): () => Promise<string> {
  return () => sleep(delay,).then(() => value);
}

describe("ResourceManager", () => {
  test("runs a single request end-to-end", async () => {
    const mgr = new ResourceManager({ defaultMax: 2, },);
    const handle = mgr.submit<string>({
      id: "r1",
      provider: "openai",
      priority: PriorityLevel.Normal,
      run: makeExec("ok",),
    },);
    expect(await handle.result,).toBe("ok",);
    expect(handle.state,).toBe("complete",);
  });

  test("caps concurrency per provider", async () => {
    const mgr = new ResourceManager({ defaultMax: 2, },);
    let live = 0;
    let peak = 0;
    const reqs: ScheduledRequest<string>[] = Array.from({ length: 6, }, (_, i,) => ({
      id: `r${i}`,
      provider: "openai",
      priority: PriorityLevel.Normal,
      run: async () => {
        live++;
        peak = Math.max(peak, live,);
        await sleep(20,);
        live--;
        return `v${i}`;
      },
    }),);
    const handles = reqs.map((r,) => mgr.submit(r,));
    await Promise.all(handles.map((h,) => h.result),);
    expect(peak,).toBeLessThanOrEqual(2,);
    expect(peak,).toBe(2,);
  });

  test("providerMax overrides defaultMax per key", async () => {
    const mgr = new ResourceManager({ defaultMax: 4, providerMax: { openai: 1, }, },);
    let liveOai = 0;
    let peakOai = 0;
    const handles: ReturnType<typeof mgr.submit<string>>[] = [];
    for (let i = 0; i < 4; i++) {
      handles.push(mgr.submit({
        id: `oai-${i}`,
        provider: "openai",
        priority: PriorityLevel.Normal,
        run: async () => {
          liveOai++;
          peakOai = Math.max(peakOai, liveOai,);
          await sleep(10,);
          liveOai--;
          return "ok";
        },
      },),);
    }
    await Promise.all(handles.map((h,) => h.result),);
    expect(peakOai,).toBe(1,);
  });

  test("different providers run in parallel without contention", async () => {
    const mgr = new ResourceManager({ defaultMax: 1, },);
    let liveA = 0;
    let liveB = 0;
    let peakCombined = 0;
    const make = (provider: string, set: { (n: number,): void },) => async () => {
      set(++peakCombined,);
      await sleep(15,);
      return provider;
    };
    void liveA;
    void liveB;
    // Use distinct trackers via closures.
    let liveCombined = 0;
    let peak = 0;
    const run = (provider: string,) => async () => {
      liveCombined++;
      peak = Math.max(peak, liveCombined,);
      await sleep(15,);
      liveCombined--;
      return provider;
    };
    void liveA;
    void liveB;
    void make;

    const a = mgr.submit({
      id: "a",
      provider: "openai",
      priority: PriorityLevel.Normal,
      run: run("openai",),
    },);
    const b = mgr.submit({
      id: "b",
      provider: "anthropic",
      priority: PriorityLevel.Normal,
      run: run("anthropic",),
    },);
    await Promise.all([a.result, b.result,],);
    // peak should be 2 if both ran truly in parallel (different providers).
    expect(peak,).toBe(2,);
  });

  test("priority orders queued requests", async () => {
    // max=1 forces strict serialization. Submit 4 jobs; the high-prio one
    // submitted last should run LAST only if priorities are equal — but
    // here we expect high-prio to overtake normal-prio ahead of it.
    const mgr = new ResourceManager({ defaultMax: 1, },);
    const order: string[] = [];
    const make = (id: string, label: string, priority: number, hold = 10,): ScheduledRequest<string> => ({
      id,
      provider: "p",
      priority,
      run: async () => {
        order.push(label,);
        await sleep(hold,);
        order.push(`${label}.done`,);
        return label;
      },
    });

    // Submit normal, normal, high, high — once max=1, only one runs at a
    // time. The queued set should run high before remaining normal.
    const r1 = mgr.submit(make("r1", "N1", PriorityLevel.Normal,),);
    const r2 = mgr.submit(make("r2", "N2", PriorityLevel.Normal,),);
    const r3 = mgr.submit(make("r3", "H1", PriorityLevel.High,),);
    const r4 = mgr.submit(make("r4", "H2", PriorityLevel.High,),);
    await Promise.all([r1.result, r2.result, r3.result, r4.result,],);

    // First to start is r1 (FIFO); the next slot cycles among queued by
    // priority. Expect H1 and H2 to both start before N2.
    const startLabels = order.filter((s,) => !s.endsWith(".done",));
    expect(startLabels[0],).toBe("N1",);
    expect(startLabels.slice(1,),).toEqual(["H1", "H2", "N2",],);
  });

  test("cancel removes a queued request and rejects awaiters", async () => {
    const mgr = new ResourceManager({ defaultMax: 1, },);
    const blocker = mgr.submit({
      id: "blocker",
      provider: "p",
      priority: PriorityLevel.Normal,
      run: makeExec("blocker", 30,),
    },);
    const queued = mgr.submit({
      id: "queued",
      provider: "p",
      priority: PriorityLevel.Normal,
      run: makeExec("queued", 5,),
    },);
    expect(queued.state,).toBe("queued",);
    expect(mgr.cancel("queued", "user-stopped",),).toBe(true,);
    await expect(queued.result,).rejects.toThrow(/user-stopped/,);
    expect(queued.state,).toBe("cancelled",);
    expect(mgr.cancel("queued",),).toBe(false,);
    await blocker.result;
  });

  test("submit rejects duplicate ids", () => {
    const mgr = new ResourceManager();
    mgr.submit({
      id: "dupe",
      provider: "p",
      priority: PriorityLevel.Normal,
      run: makeExec("x",),
    },);
    expect(() =>
      mgr.submit({
        id: "dupe",
        provider: "p",
        priority: PriorityLevel.Normal,
        run: makeExec("y",),
      },)
    ).toThrow(/duplicate/,);
  });

  test("forgetProvider drops queue + limiter", async () => {
    const mgr = new ResourceManager({ defaultMax: 2, },);
    mgr.submit({
      id: "queued",
      provider: "p",
      priority: PriorityLevel.Normal,
      run: makeExec("q", 30,),
    },);
    mgr.submit({
      id: "queued2",
      provider: "p",
      priority: PriorityLevel.Normal,
      run: makeExec("q2", 30,),
    },);
    mgr.forgetProvider("p",);
    expect(mgr.inFlight,).toBe(0,);
    // Re-submitting for the same provider gets a fresh limiter.
    const handle = mgr.submit({
      id: "after",
      provider: "p",
      priority: PriorityLevel.Normal,
      run: makeExec("after",),
    },);
    expect(await handle.result,).toBe("after",);
  });
});
