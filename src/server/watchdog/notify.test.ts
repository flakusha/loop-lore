// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { notifyOnCrashThreshold, } from "./notify";
import type { WatchdogAlert, } from "./supervisor";

type Dispatch = { url: string; init: RequestInit | undefined };

const originalFetch = globalThis.fetch;
const originalNow = Date.now;
const originalToken = process.env.LOOP_LORE_GITHUB_TOKEN;
const originalRepository = process.env.LOOP_LORE_GITHUB_REPOSITORY;

let clock = 1_000_000;
let dispatches: Dispatch[];

function alert(overrides: Partial<WatchdogAlert> = {},): WatchdogAlert {
  return { crashes: 3, windowMs: 1_000, at: clock, ...overrides, };
}

beforeEach(() => {
  clock += 10_000; // advance past any previous test's dispatch window
  dispatches = [];
  Date.now = () => clock;
  process.env.LOOP_LORE_GITHUB_TOKEN = "test-token";
  process.env.LOOP_LORE_GITHUB_REPOSITORY = "acme/loop-lore";
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit,) => {
    dispatches.push({ url: String(input,), init, },);
    return Promise.resolve(new Response(null, { status: 204, },),);
  }) as typeof fetch;
},);

afterEach(() => {
  globalThis.fetch = originalFetch;
  Date.now = originalNow;
  if (originalToken === undefined) {
    delete process.env.LOOP_LORE_GITHUB_TOKEN;
  } else {
    process.env.LOOP_LORE_GITHUB_TOKEN = originalToken;
  }

  if (originalRepository === undefined) {
    delete process.env.LOOP_LORE_GITHUB_REPOSITORY;
  } else {
    process.env.LOOP_LORE_GITHUB_REPOSITORY = originalRepository;
  }
},);

describe("notifyOnCrashThreshold", () => {
  it("POSTs one dispatch with the trigger payload", async () => {
    const info = alert();

    await notifyOnCrashThreshold(info,);

    expect(dispatches,).toHaveLength(1,);
    const dispatch = dispatches[0];
    expect(dispatch?.url,).toBe("https://api.github.com/repos/acme/loop-lore/dispatches",);
    expect(dispatch?.init?.method,).toBe("POST",);
    const body = JSON.parse(String(dispatch?.init?.body,),) as {
      event_type: string;
      client_payload: WatchdogAlert & { source: string };
    };

    expect(body.event_type,).toBe("watchdog.threshold_breach",);
    expect(body.client_payload,).toEqual({ ...info, source: "watchdog", },);
  });

  it("skips a second dispatch inside the crash window", async () => {
    await notifyOnCrashThreshold(alert({ windowMs: 5_000, },),);
    clock += 1_000;
    await notifyOnCrashThreshold(alert({ windowMs: 5_000, },),);

    expect(dispatches,).toHaveLength(1,);
  });

  it("skips the POST when GitHub credentials are missing", async () => {
    delete process.env.LOOP_LORE_GITHUB_TOKEN;

    await notifyOnCrashThreshold(alert(),);

    expect(dispatches,).toHaveLength(0,);
  });

  it("does not throw when fetch rejects", async () => {
    globalThis.fetch = (() => Promise.reject(new Error("offline",),)) as unknown as typeof fetch;

    await expect(notifyOnCrashThreshold(alert(),),).resolves.toBeUndefined();
    expect(dispatches,).toHaveLength(0,);
  });
});
