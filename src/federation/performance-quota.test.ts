// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Performance-quota ENFORCEMENT, asserted on what a peer actually receives:
 * the HTTP status, the `Retry-After` header and the namespaced `error_code` in
 * the body. Nothing here sleeps — every window is driven by an injected clock.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { PeerBudgetMode, PeerWorkloadClass, } from "../db/enums";
import {
  configurePerformanceQuota,
  performanceBudget,
  performanceQuotaEnabled,
  performanceQuotaUsage,
  recordPeerTokenUsage,
  resetPerformanceQuota,
  sweepIdlePerformanceQuota,
  trackedPerformanceQuotaCells,
} from "./performance-quota";
import { admitPeerWork, FederationQuotaErrorCode, } from "./performance-quota-guard";
import type { PerformanceBudget, } from "./performance-quota-types";

const ORIGIN = "https://gpu.example";
const T0 = 1_700_000_000_000;
const MINUTE = 60_000;

/**
 * @param overrides
 * @returns {PerformanceBudget}
 */
function budget(overrides: Partial<PerformanceBudget> = {},): PerformanceBudget {
  return {
    origin: ORIGIN,
    workloadClass: PeerWorkloadClass.Chat,
    mode: PeerBudgetMode.Hard,
    maxConcurrency: null,
    maxQueueDepth: null,
    requestsPerMinute: null,
    tokensPerMinute: null,
    ...overrides,
  };
}

/**
 * @param admission
 * @returns {Response}
 */
function refusalOf(admission: { admitted: boolean; response?: Response },): Response {
  if (admission.admitted || admission.response === undefined) {
    throw new Error(`expected a refusal, got admitted=${String(admission.admitted,)}`,);
  }

  return admission.response;
}

/**
 * @param response
 * @returns {Promise<{ error: string; code: string; data?: Record<string, unknown> }>}
 */
async function bodyOf(
  response: Response,
): Promise<{ error: string; code: string; data?: Record<string, unknown> }> {
  return await response.json() as { error: string; code: string; data?: Record<string, unknown> };
}

beforeEach(() => {
  resetPerformanceQuota();
},);

afterEach(() => {
  resetPerformanceQuota();
},);

describe("disabled / unset budgets change nothing", () => {
  test("with quotas off the work always runs and nothing is charged", async () => {
    configurePerformanceQuota({ enabled: false, budgets: [budget({ maxConcurrency: 1, requestsPerMinute: 1, },),], },);

    let ran = 0;
    for (let i = 0; i < 5; i += 1) {
      const result = await admitPeerWork(
        { origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, peerTrusted: true, now: T0 + i, },
        async () => {
          ran += 1;
          return "ok";
        },
      );

      expect(result.admitted,).toBe(true,);
    }

    expect(ran,).toBe(5,);
    expect(performanceQuotaEnabled(),).toBe(false,);
    expect(performanceBudget({ origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, },),).toBeNull();
  });

  test("a trusted peer with no configured budget is never 429'd", async () => {
    configurePerformanceQuota({ enabled: true, budgets: [], },);

    for (let i = 0; i < 200; i += 1) {
      const result = await admitPeerWork(
        { origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, peerTrusted: true, now: T0, },
        async () => "ok",
      );

      expect(result.admitted, `request ${String(i,)} was refused`,).toBe(true,);
    }
  });
});

describe("concurrency ceiling", () => {
  test("one below the ceiling is admitted, at the ceiling is a 429 the peer can route on", async () => {
    configurePerformanceQuota({ enabled: true, budgets: [budget({ maxConcurrency: 1, maxQueueDepth: 0, },),], },);

    let release = (): void => {};
    const held = new Promise<void>((resolve,) => {
      release = resolve;
    },);

    const first = admitPeerWork(
      { origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, peerTrusted: true, now: T0, },
      async () => {
        await held;
        return "first";
      },
    );

    await Promise.resolve();

    const second = await admitPeerWork(
      { origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, peerTrusted: true, now: T0, },
      async () => "second",
    );

    const refused = refusalOf(second,);
    expect(refused.status,).toBe(429,);
    const body = await bodyOf(refused,);
    expect(body.code,).toBe("TOO_MANY_REQUESTS",);
    expect(body.data?.error_code,).toBe(FederationQuotaErrorCode.QuotaExceeded,);
    expect(body.data?.limit,).toBe("max_concurrency",);
    expect(refused.headers.get("Retry-After",),).toBe("5",);
    expect(refused.headers.get("X-RateLimit-Remaining",),).toBe("0",);

    release();
    const firstResult = await first;
    expect(firstResult.admitted,).toBe(true,);
    if (firstResult.admitted) { expect(firstResult.value,).toBe("first",); }
  });

  test("under the queue depth the request waits for a slot and then runs", async () => {
    configurePerformanceQuota({ enabled: true, budgets: [budget({ maxConcurrency: 1, maxQueueDepth: 1, },),], },);

    let release = (): void => {};
    const held = new Promise<void>((resolve,) => {
      release = resolve;
    },);

    const first = admitPeerWork(
      { origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, peerTrusted: true, now: T0, },
      async () => {
        await held;
        return "first";
      },
    );

    await Promise.resolve();

    const queued = admitPeerWork(
      {
        origin: ORIGIN,
        workloadClass: PeerWorkloadClass.Chat,
        peerTrusted: true,
        now: T0,
        queueTimeoutMs: 60000,
      },
      async () => "second",
    );

    release();
    const admitted = await queued;
    expect(admitted.admitted,).toBe(true,);
    if (admitted.admitted) { expect(admitted.value,).toBe("second",); }
    const firstResult = await first;
    expect(firstResult.admitted,).toBe(true,);
    if (firstResult.admitted) { expect(firstResult.value,).toBe("first",); }
  });

  test("a throwing handler releases its slot instead of leaking it", async () => {
    configurePerformanceQuota({ enabled: true, budgets: [budget({ maxConcurrency: 1, maxQueueDepth: 0, },),], },);

    await expect(admitPeerWork(
      { origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, peerTrusted: true, now: T0, },
      async () => {
        throw new Error("boom",);
      },
    ),).rejects.toThrow("boom",);

    const usage = performanceQuotaUsage({ origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, now: T0, },);
    expect(usage.inFlight,).toBe(0,);
    const after = await admitPeerWork(
      { origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, peerTrusted: true, now: T0, },
      async () => "second",
    );

    expect(after.admitted,).toBe(true,);
  });
});

describe("requests-per-minute window", () => {
  test("admits up to the limit, refuses past it, and admits again after the window", async () => {
    configurePerformanceQuota({ enabled: true, budgets: [budget({ requestsPerMinute: 3, },),], },);

    for (let i = 0; i < 3; i += 1) {
      const ok = await admitPeerWork(
        { origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, peerTrusted: true, now: T0 + i, },
        async () => "ok",
      );

      expect(ok.admitted, `request ${String(i,)} inside the window`,).toBe(true,);
    }

    const over = await admitPeerWork(
      { origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, peerTrusted: true, now: T0 + 4, },
      async () => "ok",
    );

    const refused = refusalOf(over,);
    expect(refused.status,).toBe(429,);
    expect((await bodyOf(refused,)).data?.limit,).toBe("requests_per_minute",);
    expect(Number(refused.headers.get("Retry-After",),),).toBeGreaterThan(0,);

    const afterWindow = await admitPeerWork(
      { origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, peerTrusted: true, now: T0 + 2 * MINUTE, },
      async () => "ok",
    );

    expect(afterWindow.admitted,).toBe(true,);
  });

  test("a 429 excludes the peer for its Retry-After and re-admits after it", async () => {
    configurePerformanceQuota({ enabled: true, budgets: [budget({ requestsPerMinute: 1, },),], },);

    await admitPeerWork(
      { origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, peerTrusted: true, now: T0, },
      async () => "ok",
    );

    refusalOf(
      await admitPeerWork(
        { origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, peerTrusted: true, now: T0 + 1, },
        async () => "ok",
      ),
    );

    const usage = performanceQuotaUsage({ origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, now: T0 + 2, },);
    expect(usage.excluded,).toBe(true,);
    expect(usage.excludedLimit,).toBe("requests_per_minute",);

    const stillRefused = await admitPeerWork(
      { origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, peerTrusted: true, now: T0 + 2, },
      async () => "ok",
    );

    expect(refusalOf(stillRefused,).status,).toBe(429,);

    const reAdmitted = await admitPeerWork(
      { origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, peerTrusted: true, now: T0 + MINUTE + 5, },
      async () => "ok",
    );

    expect(reAdmitted.admitted,).toBe(true,);
  });
});

describe("advisory budgets never refuse", () => {
  test("an advisory request budget is exceeded and the work still runs", async () => {
    configurePerformanceQuota({
      enabled: true,
      budgets: [budget({ mode: PeerBudgetMode.Advisory, requestsPerMinute: 1, },),],
    },);

    for (let i = 0; i < 4; i += 1) {
      const result = await admitPeerWork(
        { origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, peerTrusted: true, now: T0 + i, },
        async () => "ok",
      );

      expect(result.admitted,).toBe(true,);
    }

    const usage = performanceQuotaUsage({ origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, now: T0, },);
    expect(usage.requestsRemaining,).toBe(0,);
  });

  test("an advisory concurrency ceiling does not queue or refuse", async () => {
    configurePerformanceQuota({
      enabled: true,
      budgets: [budget({ mode: PeerBudgetMode.Advisory, maxConcurrency: 1, maxQueueDepth: 0, },),],
    },);

    let release = (): void => {};
    const held = new Promise<void>((resolve,) => {
      release = resolve;
    },);

    const first = admitPeerWork(
      { origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, peerTrusted: true, now: T0, },
      async () => {
        await held;
        return "first";
      },
    );

    await Promise.resolve();

    const second = await admitPeerWork(
      { origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, peerTrusted: true, now: T0, },
      async () => "second",
    );

    expect(second.admitted,).toBe(true,);

    release();
    await first;
  });

  test("the token rate is reported past its ceiling and never refuses", async () => {
    configurePerformanceQuota({ enabled: true, budgets: [budget({ tokensPerMinute: 100, },),], },);

    const ran = await admitPeerWork(
      { origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, peerTrusted: true, now: T0, },
      async () => "generated",
    );

    expect(ran.admitted,).toBe(true,);

    recordPeerTokenUsage({ origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, tokens: 4000, now: T0 + 1, },);
    const usage = performanceQuotaUsage({ origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, now: T0 + 2, },);
    expect(usage.tokensPerMinute,).toBe(100,);
    expect(usage.tokensUsed,).toBe(4000,);

    const after = await admitPeerWork(
      { origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, peerTrusted: true, now: T0 + 3, },
      async () => "still runs",
    );

    expect(after.admitted,).toBe(true,);
  });
});

describe("trust and class checks fail closed", () => {
  test("a suspended or untrusted peer is refused and never charged", async () => {
    configurePerformanceQuota({ enabled: true, budgets: [budget({ requestsPerMinute: 2, },),], },);

    await admitPeerWork(
      { origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, peerTrusted: true, now: T0, },
      async () => "ok",
    );

    const untrusted = await admitPeerWork(
      { origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, peerTrusted: false, now: T0 + 1, },
      async () => "ok",
    );

    const refused = refusalOf(untrusted,);
    expect(refused.status,).toBe(403,);
    expect((await bodyOf(refused,)).data?.error_code,).toBe(FederationQuotaErrorCode.PeerUntrusted,);
    expect(refused.headers.get("Retry-After",),).toBeNull();

    const usage = performanceQuotaUsage({ origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, now: T0 + 2, },);
    expect(usage.requestsRemaining,).toBe(1,);
    expect(usage.excluded,).toBe(false,);

    const stillTrusted = await admitPeerWork(
      { origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, peerTrusted: true, now: T0 + 3, },
      async () => "ok",
    );

    expect(stillTrusted.admitted,).toBe(true,);
  });

  test("a class outside the closed set is refused, not treated as unlimited", async () => {
    configurePerformanceQuota({ enabled: true, budgets: [], },);

    const refused = refusalOf(
      await admitPeerWork(
        {
          origin: ORIGIN,
          workloadClass: "gpu-mining" as PeerWorkloadClass,
          peerTrusted: true,
          now: T0,
        },
        async () => "ok",
      ),
    );

    expect(refused.status,).toBe(403,);
    expect((await bodyOf(refused,)).data?.error_code,)
      .toBe(FederationQuotaErrorCode.UnknownWorkloadClass,);
  });
});

describe("configuration reload and counter lifetime", () => {
  test("a reload keeps the budget AND the counters it has already accumulated", async () => {
    configurePerformanceQuota({ enabled: true, budgets: [budget({ requestsPerMinute: 2, },),], },);
    await admitPeerWork(
      { origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, peerTrusted: true, now: T0, },
      async () => "ok",
    );

    configurePerformanceQuota({ enabled: true, budgets: [budget({ requestsPerMinute: 2, },),], },);

    const usage = performanceQuotaUsage({ origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, now: T0 + 1, },);
    expect(usage.requestsRemaining,).toBe(1,);
  });

  test("after a restart the budget still refuses and the counters start at zero", async () => {
    configurePerformanceQuota({ enabled: true, budgets: [budget({ requestsPerMinute: 1, },),], },);
    await admitPeerWork(
      { origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, peerTrusted: true, now: T0, },
      async () => "ok",
    );

    resetPerformanceQuota();
    expect(trackedPerformanceQuotaCells(),).toBe(0,);
    configurePerformanceQuota({ enabled: true, budgets: [budget({ requestsPerMinute: 1, },),], },);

    const usage = performanceQuotaUsage({ origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, now: T0, },);
    expect(usage.requestsRemaining,).toBe(1,);
    await admitPeerWork(
      { origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, peerTrusted: true, now: T0, },
      async () => "ok",
    );

    expect(
      refusalOf(
        await admitPeerWork(
          { origin: ORIGIN, workloadClass: PeerWorkloadClass.Chat, peerTrusted: true, now: T0, },
          async () => "ok",
        ),
      ).status,
    ).toBe(429,);
  });

  test("a cell idle past the TTL is pruned, so churn cannot grow the map", async () => {
    const budgets: PerformanceBudget[] = [];
    for (let i = 0; i < 5; i += 1) {
      budgets.push(budget({ origin: `https://peer-${String(i,)}.example`, },),);
    }

    configurePerformanceQuota({ enabled: true, budgets, },);
    expect(trackedPerformanceQuotaCells(),).toBe(5,);

    for (let i = 0; i < 5; i += 1) {
      await admitPeerWork(
        {
          origin: `https://peer-${String(i,)}.example`,
          workloadClass: PeerWorkloadClass.Chat,
          peerTrusted: true,
          now: T0,
        },
        async () => "ok",
      );
    }

    expect(sweepIdlePerformanceQuota(T0 + 11 * MINUTE,),).toBe(5,);
    expect(trackedPerformanceQuotaCells(),).toBe(0,);
  });
});
