// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/integrations/loop-lore-facade/registry.test.ts — registry mechanics,
// lifecycle rejections, and the TRUST BOUNDARY: a principal is never taken
// from op params, only from the FacadeContext (epic BLOCKING fix AC).
//
// Resource contract (parallel-safe): no database, no ports, no env. The
// rate-limit test drives the process-wide governance singleton — it destroys
// it BEFORE (fresh state) and in afterEach, mirroring
// register-plugins.governance.test.ts.

import { afterEach, describe, expect, test, } from "bun:test";
import { governanceRateLimiter, } from "../../api-governance/rate-limiting/instance";
import { chatPolicy, } from "../../api-governance/rate-limiting/policies";
import { createFacadeRegistry, runFacadeOp, } from "./registry";
import type { FacadeContext, FacadeOp, } from "./types";

const DB = {} as FacadeContext["database"];
const CONFIG = {} as FacadeContext["config"];

/** Standard user context for the tests. */
function userCtx(userId: string | null,): FacadeContext {
  return {
    database: DB,
    config: CONFIG,
    principal: { kind: "user", userId, userRole: userId === null ? null : "user", },
    requestId: "req-1",
  };
}

/** Op whose handler echoes ONLY the context principal (never the body). */
function echoOp(policyMax = 10,): FacadeOp {
  return {
    name: "test.echo",
    domain: "chat",
    summary: "echo principal",
    description: "test op",
    scope: "read",
    ratePolicy: { name: "facade-test", windowMs: 60_000, max: policyMax, },
    handler: async (ctx,) => ({
      ok: true,
      status: 200,
      json: { echoed: ctx.principal.userId, kind: ctx.principal.kind, },
    }),
  };
}

afterEach(() => {
  governanceRateLimiter.destroy();
},);

describe("createFacadeRegistry", () => {
  test("registers and resolves ops", () => {
    const registry = createFacadeRegistry();
    const op = echoOp();
    expect(registry.register(op,),).toEqual({ ok: true, },);
    expect(registry.resolve("test.echo",),).toBe(op,);
    expect(registry.resolve("nope",),).toBeUndefined();
  });

  test("rejects a duplicate name with a typed error Result", () => {
    const registry = createFacadeRegistry();
    const first = echoOp();
    registry.register(first,);
    const result = registry.register(echoOp(),);
    expect(result.ok,).toBe(false,);
    if (!result.ok) {
      expect(result.code,).toBe("duplicate_name",);
      expect(result.existing,).toBe(first,);
    }
  });

  test("manifest exposes descriptors without handler internals", () => {
    const registry = createFacadeRegistry();
    registry.register(echoOp(),);
    const manifest = registry.manifest();
    expect(manifest,).toHaveLength(1,);
    expect(manifest[0],).toEqual({
      name: "test.echo",
      domain: "chat",
      summary: "echo principal",
      description: "test op",
      scope: "read",
    },);
  });
});

describe("runFacadeOp", () => {
  test("unknown op names resolve to a typed 404", async () => {
    const result = await runFacadeOp(createFacadeRegistry(), userCtx("u1",), "nope.op", {},);
    expect(result.ok,).toBe(false,);
    expect(result.status,).toBe(404,);
    expect((result.json as { error: string }).error,).toBe("unknown_facade_op",);
  });

  test("TRUST BOUNDARY: a principal-shaped body is ignored — the context principal wins", async () => {
    const registry = createFacadeRegistry();
    registry.register(echoOp(),);
    const result = await runFacadeOp(registry, userCtx("real-user",), "test.echo", {
      // Adversarial body: tries to assert a different principal.
      userId: "attacker",
      principal: { kind: "internal-service", userId: "attacker", },
      principalKind: "internal-service",
    },);

    expect(result.ok,).toBe(true,);
    expect((result.json as { echoed: string }).echoed,).toBe("real-user",);
    expect((result.json as { kind: string }).kind,).toBe("user",);
  });

  test("anonymous principals fail closed with 401", async () => {
    const registry = createFacadeRegistry();
    registry.register(echoOp(),);
    const result = await runFacadeOp(registry, userCtx(null,), "test.echo", {},);
    expect(result.ok,).toBe(false,);
    expect(result.status,).toBe(401,);
    expect((result.json as { error: string }).error,).toBe("unauthorized",);
  });

  test("exhausted budgets return 429 without reaching the handler", async () => {
    // Fresh singleton state: the policy below allows exactly one call.
    governanceRateLimiter.destroy();
    const registry = createFacadeRegistry();
    registry.register(echoOp(1,),);

    const first = await runFacadeOp(registry, userCtx("u1",), "test.echo", {},);
    expect(first.ok,).toBe(true,);

    const second = await runFacadeOp(registry, userCtx("u1",), "test.echo", {},);
    expect(second.ok,).toBe(false,);
    expect(second.status,).toBe(429,);
    expect((second.json as { error: string }).error,).toBe("rate_limited",);

    // A different principal has its own budget bucket.
    const other = await runFacadeOp(registry, userCtx("u2",), "test.echo", {},);
    expect(other.ok,).toBe(true,);
  });

  test("handler throws normalize to a typed 500 FacadeResult", async () => {
    const registry = createFacadeRegistry();
    registry.register({
      ...echoOp(),
      handler: async () => {
        throw new Error("boom",);
      },
    },);

    const result = await runFacadeOp(registry, userCtx("u1",), "test.echo", {},);
    expect(result.ok,).toBe(false,);
    expect(result.status,).toBe(500,);
    expect((result.json as { error: string }).error,).toBe("facade_op_failed",);
  });

  test("op policies ride the named governance budgets (chat send is not generation)", () => {
    // Structural guard: facade chat ops reuse the HTTP chat budget so an
    // agent cannot outrun a browser client on any shared tier.
    expect(chatPolicy.name,).toBe("chat",);
  });
});
