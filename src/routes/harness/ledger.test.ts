// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route tests for the harness usage-ledger surface: the admin guard denies
 * non-admins and unauthenticated callers WITHOUT leaking any ledger data, an
 * uncomposed runtime reads 503 (inert when the integration is disabled), and
 * the listing carries the RAW ledger rows — every profile the ledger has
 * seen, insertion order, no breaker column (that merge is /usage's job).
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
import { harnessLedgerRoutes, } from "./ledger";

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
    .use(harnessLedgerRoutes(),);

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

describe("harnessLedgerRoutes", () => {
  it("denies a non-admin", async () => {
    composeRuntime();

    const res = await hit("member", "/api/v1/harness/ledger",);
    expect(res.status,).toBe(403,);
  });

  it("denies an unauthenticated caller", async () => {
    composeRuntime();

    const res = await hit(null, "/api/v1/harness/ledger",);
    expect(res.status,).toBe(403,);
  });

  it("leaks no ledger data to a denied caller", async () => {
    composeRuntime();

    for (const role of ["member", null,]) {
      const res = await hit(role, "/api/v1/harness/ledger",);
      const body = await res.text();
      expect(body,).not.toContain("dispatchesInWindow",);
      expect(body,).not.toContain("tokensInDay",);
      expect(body,).not.toContain("quotaResetAt",);
    }
  });

  it("reads 503 when the runtime is not composed", async () => {
    const res = await hit("admin", "/api/v1/harness/ledger",);
    expect(res.status,).toBe(503,);
  });

  it("a disabled config composes no runtime, so the surface stays inert", async () => {
    initHarnessRuntime({ enabled: false, profiles: [], },);

    const res = await hit("admin", "/api/v1/harness/ledger",);
    expect(res.status,).toBe(503,);
  });

  it("lists each ledger row with its rolling windows and quota reset", async () => {
    composeRuntime();

    const res = await hit("admin", "/api/v1/harness/ledger",);
    expect(res.status,).toBe(200,);
    const body = await res.json() as {
      items: Array<{
        profile: string;
        dispatchesInWindow: number;
        tokensInDay: number;
        quotaResetAt: number | null;
      }>;
    };

    expect(body.items,).toEqual([
      {
        profile: "p",
        dispatchesInWindow: 1,
        tokensInDay: 100,
        quotaResetAt: null,
      },
    ],);
  });

  it("is the RAW ledger: unconfigured profiles keep their row, in insertion order", async () => {
    composeRuntime();
    // A profile that has left the config still holds a ledger row — the
    // breaker-filtered /usage view hides it; the raw ledger must not.
    getHarnessRuntime()?.ledger.record("gone", 5,);

    const res = await hit("admin", "/api/v1/harness/ledger",);
    const body = await res.json() as { items: Array<{ profile: string; tokensInDay: number }> };
    expect(body.items.map((row,) => row.profile),).toEqual(["p", "gone",],);
    expect(body.items[1]?.tokensInDay,).toBe(5,);
  });

  it("surfaces an externally reported quota reset on the ledger row", async () => {
    composeRuntime();
    getHarnessRuntime()?.ledger.applyUsageReports("p", [
      { providerId: "zai", status: "exhausted", remainingFraction: 0, resetsAt: "2030-01-01T00:00:00Z", },
    ],);

    const res = await hit("admin", "/api/v1/harness/ledger",);
    const body = await res.json() as { items: Array<{ quotaResetAt: number | null }> };
    expect(body.items[0]?.quotaResetAt,).toBe(Date.parse("2030-01-01T00:00:00Z",),);
  });
});
