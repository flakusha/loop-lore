// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for the settings quota Alpine mixin (src/frontend/alpine/settings/quota.ts).
 *
 * Same harness as general.test.ts: the mixin talks through the ambient
 * `apiFetch` global, stubbed per test.
 */
import "../i18n.test-helper";
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { isQuotaExhausted, quota, type QuotaGaugeResource, quotaPercentUsed, } from "./quota";

type ApiFetchMock = (url: string, opts?: RequestInit,) => Promise<Response>;

interface Call {
  url: string;
  opts?: RequestInit;
}

interface Host {
  quotaResources: QuotaGaugeResource[];
  quotaIsAdmin: boolean;
  quotaNotice: string;
  loadQuotaState(): Promise<void>;
  quotaPercent(used: number, ceiling: number | null,): number;
  notifyQuotaExceeded(error: { name?: string; kind?: string; limit?: number },): void;
  overrideQuota(resourceId: string,): Promise<void>;
}

const globals = globalThis as unknown as Record<string, unknown>;
const originalApiFetch = globals.apiFetch;

let calls: Call[] = [];
let handler: ApiFetchMock = async () => Response.json({},);

function freshHost(): Host {
  const host = {
    quotaResources: [],
    quotaIsAdmin: false,
    quotaNotice: "",
    loadQuotaState: async () => {},
    quotaPercent: () => 0,
    notifyQuotaExceeded: () => {},
    overrideQuota: async () => {},
  } as unknown as Host;

  Object.assign(host, quota(),);
  return host;
}

beforeEach(() => {
  calls = [];
  handler = async () => Response.json({},);
  globals.apiFetch = (url: string, opts?: RequestInit,) => {
    calls.push({ url, opts, },);
    return handler(url, opts,);
  };
},);

afterEach(() => {
  globals.apiFetch = originalApiFetch;
},);

describe("quotaPercentUsed", () => {
  test("half of the ceiling reads 0.5", () => {
    expect(quotaPercentUsed(5, 10,),).toBe(0.5,);
  });

  test("unlimited (null) reads 0", () => {
    expect(quotaPercentUsed(999, null,),).toBe(0,);
  });

  test("over-use clamps to 1", () => {
    expect(quotaPercentUsed(12, 10,),).toBe(1,);
  });
});

describe("isQuotaExhausted", () => {
  test("used meeting the ceiling is exhausted", () => {
    expect(isQuotaExhausted(10, 10,),).toBe(true,);
  });

  test("used below the ceiling is not", () => {
    expect(isQuotaExhausted(9, 10,),).toBe(false,);
  });

  test("unlimited is never exhausted", () => {
    expect(isQuotaExhausted(999, null,),).toBe(false,);
  });
});

describe("settings quota mixin", () => {
  test("loadQuotaState fills the gauge and flags exhaustion", async () => {
    handler = async () =>
      Response.json({
        resources: [
          {
            id: "r1",
            provider: "mock",
            type: "inference",
            status: "active",
            overQuota: true,
            dimensions: [{ key: "requests", used: 10, ceiling: 10, },],
          },
        ],
        isAdmin: false,
      },);

    const host = freshHost();
    await host.loadQuotaState();
    expect(host.quotaResources.length,).toBe(1,);
    expect(host.quotaResources[0]?.overQuota,).toBe(true,);
    expect(host.quotaNotice,).toBe("quotaExhausted",);
    expect(host.quotaIsAdmin,).toBe(false,);
    expect(host.quotaPercent(5, 10,),).toBe(50,);
  });

  test("non-quota errors map nothing onto the notice", () => {
    const host = freshHost();
    host.notifyQuotaExceeded({ name: "Error", },);
    expect(host.quotaNotice,).toBe("",);
  });

  test("QuotaExceededError raises the exhaustion notice", () => {
    const host = freshHost();
    host.notifyQuotaExceeded({ name: "QuotaExceededError", kind: "requests", limit: 10, },);
    expect(host.quotaNotice,).toBe("quotaExhausted",);
  });

  test("non-admins never call the override route", async () => {
    const host = freshHost();
    host.quotaIsAdmin = false;
    await host.overrideQuota("r1",);
    expect(calls.length,).toBe(0,);
  });

  test("admin override posts the resource and reloads", async () => {
    let posts = 0;
    handler = async (url: string,) => {
      if (url === "/api/v1/generation/quota/override") {
        posts += 1;
        return Response.json({ ok: true, },);
      }

      return Response.json({ resources: [], isAdmin: true, },);
    };

    const host = freshHost();
    host.quotaIsAdmin = true;
    await host.overrideQuota("r1",);
    expect(posts,).toBe(1,);
    expect(calls.some((c,) => c.url === "/api/v1/generation/quota-state"),).toBe(true,);
  });
});
