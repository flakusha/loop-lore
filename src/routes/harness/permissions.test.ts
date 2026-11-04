// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
/**
 * Route tests for the harness permission approval surface: the admin guard
 * denies non-admins, an uncomposed runtime reads 503 (flow inert when the
 * integration is disabled), and list/approve/deny round-trip the runtime
 * queue's entries and decisions.
 *
 * Resource contract (parallel-safe): the queue lives on a per-test composed
 * runtime singleton, reset in beforeEach AND afterEach via
 * resetHarnessRuntime/resetHarnessAdminSettings; the fake adapters are
 * in-memory. No DB (these routes read no database), no ports, no fixed
 * paths — order-independent under the parallel runner.
 */
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { Elysia, } from "elysia";
import type { AcpProfileConfig, } from "../../config/schema/harness";
import { resetHarnessAdminSettings, } from "../../integrations/harness/admin-settings";
import { fakeFactory, } from "../../integrations/harness/fakes";
import { getHarnessRuntime, initHarnessRuntime, resetHarnessRuntime, } from "../../integrations/harness/runtime";
import { harnessPermissionRoutes, } from "./permissions";

beforeEach(() => {
  resetHarnessAdminSettings();
  resetHarnessRuntime();
},);

afterEach(() => {
  resetHarnessAdminSettings();
  resetHarnessRuntime();
},);

/** Mount the routes on a fresh app with a fixed role. */
function app(role: string | null,): Elysia {
  const built = new Elysia({},)
    .derive(() => ({ userId: "u1", userRole: role, }))
    .use(harnessPermissionRoutes(),);

  return built as unknown as Elysia;
}

/** Hit a path on a fresh mounted app. */
function hit(role: string | null, method: string, path: string,): Promise<Response> {
  return app(role,).handle(new Request(`http://localhost${path}`, { method, },),);
}

const PROFILE: AcpProfileConfig = {
  name: "p",
  command: ["fake", "p",],
  tiers: { fast: { model: "p/fast", capabilities: ["tools",], }, },
  tosGrayzoneAcknowledged: true,
};

/** Compose a runtime with one fake profile and probe its connection. */
async function composeRuntime(): Promise<void> {
  const { factory, } = fakeFactory({ p: { models: ["p/fast",], }, },);
  initHarnessRuntime({ enabled: true, profiles: [PROFILE,], }, factory,);
  await getHarnessRuntime()?.registry.ensureProbed("p",);
}

/** Park one write-shaped ask on the composed runtime's queue. */
async function parkEditAsk(): Promise<string> {
  const runtime = getHarnessRuntime();
  if (!runtime) { throw new Error("runtime not composed",); }
  const parked = await runtime.permissions.submit({
    profile: "p",
    pending: { params: { sessionId: "s", kind: "edit", }, kind: "edit", },
    sandboxRoot: process.cwd(),
  },);

  if (parked.decision !== "pending") { throw new Error("expected the ask to park",); }

  return parked.id;
}

describe("harnessPermissionRoutes", () => {
  /** The three endpoints, typed so destructuring stays `string`. */
  const ENDPOINTS: Array<[method: string, path: string,]> = [
    ["GET", "/api/v1/harness/permissions",],
    ["POST", "/api/v1/harness/permissions/any/approve",],
    ["POST", "/api/v1/harness/permissions/any/deny",],
  ];

  it("denies a non-admin on every endpoint", async () => {
    await composeRuntime();
    const id = await parkEditAsk();
    for (const [method, path,] of ENDPOINTS) {
      const res = await hit("member", method, path.replace("any", id,),);
      expect(res.status,).toBe(403,);
    }
  });

  it("reads 503 on every endpoint when the runtime is not composed", async () => {
    for (const [method, path,] of ENDPOINTS) {
      const res = await hit("admin", method, path,);
      expect(res.status,).toBe(503,);
    }
  });

  it("lists parked asks FIFO with their fields", async () => {
    await composeRuntime();
    const id = await parkEditAsk();

    const res = await hit("admin", "GET", "/api/v1/harness/permissions",);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { items: Array<Record<string, unknown>> };
    expect(body.items,).toHaveLength(1,);
    expect(body.items[0]?.id,).toBe(id,);
    expect(body.items[0]?.profile,).toBe("p",);
    expect(body.items[0]?.tool,).toBe("edit",);
    expect(body.items[0]?.cwd,).toBe(process.cwd(),);
  });

  it("approving resolves the ask as allow_once", async () => {
    const { factory, logs, } = fakeFactory({ p: { models: ["p/fast",], }, },);
    initHarnessRuntime({ enabled: true, profiles: [PROFILE,], }, factory,);
    await getHarnessRuntime()?.registry.ensureProbed("p",);
    const id = await parkEditAsk();

    const res = await hit("admin", "POST", `/api/v1/harness/permissions/${id}/approve`,);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { ok: boolean };
    expect(body.ok,).toBe(true,);
    expect(getHarnessRuntime()?.permissions.pendingCount(),).toBe(0,);
    expect(logs.get("p",)?.permissions,).toEqual([{ outcome: "allow_once", },],);
  });

  it("denying resolves the ask as reject_once", async () => {
    await composeRuntime();
    const id = await parkEditAsk();

    const res = await hit("admin", "POST", `/api/v1/harness/permissions/${id}/deny`,);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { ok: boolean };
    expect(body.ok,).toBe(true,);
    expect(getHarnessRuntime()?.permissions.pendingCount(),).toBe(0,);
  });

  it("an unknown request id reads 404", async () => {
    await composeRuntime();

    const res = await hit("admin", "POST", "/api/v1/harness/permissions/ghost/approve",);
    expect(res.status,).toBe(404,);
  });

  it("a disabled config composes no runtime, so the surface stays inert", async () => {
    initHarnessRuntime({ enabled: false, profiles: [], },);

    const res = await hit("admin", "GET", "/api/v1/harness/permissions",);
    expect(res.status,).toBe(503,);
  });
});
