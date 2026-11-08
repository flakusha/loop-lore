// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
/**
 * Route tests for the harness usage surface: the admin guard denies
 * non-admins and unauthenticated callers WITHOUT leaking any ledger data,
 * an uncomposed runtime reads 503 (inert when the integration is disabled),
 * and the listing carries the ledger's rolling windows next to the breaker's
 * per-profile state.
 *
 * Resource contract (parallel-safe): the runtime is the per-test composed
 * singleton, reset in beforeEach AND afterEach via resetHarnessRuntime; fake
 * adapters are in-memory. No ports, no sleeps, no fixed paths —
 * order-independent under the parallel runner.
 */
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { Elysia, } from "elysia";
import type { AcpProfileConfig, } from "../../config/schema/harness";
import { fakeFactory, } from "../../integrations/harness/fakes";
import { getHarnessRuntime, initHarnessRuntime, resetHarnessRuntime, } from "../../integrations/harness/runtime";
import { harnessProfileUsage, } from "../../integrations/harness/usage-view";
import { harnessUsageRoutes, } from "./usage";

beforeEach(() => {
  resetHarnessRuntime();
},);

afterEach(() => {
  resetHarnessRuntime();
},);

/** Mount the routes on a fresh app with a fixed role. */
function app(role: string | null,): Elysia {
  const built = new Elysia({},)
    .derive(() => ({ userId: "u1", userRole: role, }))
    .use(harnessUsageRoutes(),);

  return built as unknown as Elysia;
}

/** Hit a path on a fresh mounted app. */
function hit(role: string | null, path: string,): Promise<Response> {
  return app(role,).handle(new Request(`http://localhost${path}`,),);
}

const LIVE: AcpProfileConfig = {
  name: "p",
  command: ["fake", "p",],
  tiers: { fast: { model: "zai/glm-4.6", capabilities: ["tools",], }, },
};

/** Compose a runtime with one profile that has recorded usage. */
function composeRuntime(): void {
  const { factory, } = fakeFactory({ p: { models: ["zai/glm-4.6",], }, },);
  initHarnessRuntime({ enabled: true, profiles: [LIVE,], }, factory,);
  getHarnessRuntime()?.ledger.record("p", 100,);
}

describe("harnessUsageRoutes", () => {
  it("denies a non-admin", async () => {
    composeRuntime();

    const res = await hit("member", "/api/v1/harness/usage",);
    expect(res.status,).toBe(403,);
  });

  it("denies an unauthenticated caller", async () => {
    composeRuntime();

    const res = await hit(null, "/api/v1/harness/usage",);
    expect(res.status,).toBe(403,);
  });

  it("leaks no ledger data to a denied caller", async () => {
    composeRuntime();

    for (const role of ["member", null,]) {
      const res = await hit(role, "/api/v1/harness/usage",);
      const body = await res.text();
      expect(body,).not.toContain("dispatchesInWindow",);
      expect(body,).not.toContain("tokensInDay",);
      expect(body,).not.toContain("quotaResetAt",);
      expect(body,).not.toContain("breakerOpen",);
      expect(body,).not.toContain("breakerTrips",);
    }
  });

  it("reads 503 when the runtime is not composed", async () => {
    const res = await hit("admin", "/api/v1/harness/usage",);
    expect(res.status,).toBe(503,);
  });

  it("a disabled config composes no runtime, so the surface stays inert", async () => {
    initHarnessRuntime({ enabled: false, profiles: [], },);

    const res = await hit("admin", "/api/v1/harness/usage",);
    expect(res.status,).toBe(503,);
  });

  it("lists each profile's usage windows next to its breaker state", async () => {
    composeRuntime();

    const res = await hit("admin", "/api/v1/harness/usage",);
    expect(res.status,).toBe(200,);
    const body = await res.json() as {
      items: Array<{
        profile: string;
        dispatchesInWindow: number;
        tokensInDay: number;
        quotaResetAt: number | null;
        breakerOpen: boolean;
        breakerCooldownRemainingMs: number;
        breakerTrips: number;
      }>;
    };

    expect(body.items,).toEqual([
      {
        profile: "p",
        dispatchesInWindow: 1,
        tokensInDay: 100,
        quotaResetAt: null,
        breakerOpen: false,
        breakerCooldownRemainingMs: 0,
        breakerTrips: 0,
      },
    ],);
  });

  it("reports a tripped breaker as open with its cooldown", async () => {
    composeRuntime();
    const runtime = getHarnessRuntime();
    for (let i = 0; i < 3; i++) { runtime?.breaker.onFailure("p",); }

    const res = await hit("admin", "/api/v1/harness/usage",);
    const body = await res.json() as { items: Array<{ breakerOpen: boolean; breakerTrips: number }> };
    expect(body.items[0]?.breakerOpen,).toBe(true,);
    expect(body.items[0]?.breakerTrips,).toBe(1,);
  });

  it("counts every trip, not just the current one", async () => {
    composeRuntime();
    const runtime = getHarnessRuntime();
    // Two trips: the breaker opens, a success closes it, then it opens again.
    for (let i = 0; i < 3; i++) { runtime?.breaker.onFailure("p",); }
    runtime?.breaker.onSuccess("p",);
    for (let i = 0; i < 3; i++) { runtime?.breaker.onFailure("p",); }

    const res = await hit("admin", "/api/v1/harness/usage",);
    const body = await res.json() as { items: Array<{ breakerTrips: number }> };
    expect(body.items[0]?.breakerTrips,).toBe(2,);
  });

  it("the shared read view carries the same rows as the endpoint", async () => {
    composeRuntime();
    const runtime = getHarnessRuntime();
    expect(runtime,).not.toBeNull();
    if (!runtime) { return; }

    const rows = harnessProfileUsage(runtime,);
    expect(rows.map((row,) => row.profile),).toEqual(["p",],);
    expect(rows[0]?.dispatchesInWindow,).toBe(1,);
    expect(rows[0]?.tokensInDay,).toBe(100,);
  });
});
