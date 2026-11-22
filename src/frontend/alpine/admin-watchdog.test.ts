// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import "./i18n.test-helper";
import { afterEach, beforeEach, expect, test, } from "bun:test";
import type { ApiFetchMock, } from "../tests/test-types";
import {
  createAdminWatchdog,
  filterWatchdogEvents,
  watchdogBadgeFor,
  watchdogBadgeLabel,
  watchdogCreatedAtMs,
  type WatchdogEventRow,
} from "./admin-watchdog";

const g = globalThis as unknown as { apiFetch?: ApiFetchMock };
const originalFetch = g.apiFetch;

/** The "now" every recency assertion is measured against. */
const NOW = Date.parse("2026-11-22T12:00:00Z",);

/** One exec-log row; the fields a test does not care about get sane defaults. */
function row(overrides: Partial<WatchdogEventRow> = {},): WatchdogEventRow {
  return {
    id: 1,
    event_kind: "probe",
    decision_kind: "wait",
    at_ms: NOW,
    created_at: "2026-11-22 11:59:00",
    reason: null,
    misses: null,
    crashes: null,
    ...overrides,
  };
}

let calls: string[] = [];
let handler: ApiFetchMock = async () => Response.json({ data: [], },);

beforeEach(() => {
  calls = [];
  handler = async () => Response.json({ data: [], },);
  g.apiFetch = (url: string,) => {
    calls.push(url,);
    return handler(url,);
  };
},);

afterEach(() => {
  g.apiFetch = originalFetch;
},);

test("the badge follows the transition kinds", () => {
  expect(watchdogBadgeFor("probe", "wait",),).toBe("watching",);
  expect(watchdogBadgeFor("probe", "kill",),).toBe("degraded",);
  expect(watchdogBadgeFor("crash", "restart",),).toBe("restarting",);
  expect(watchdogBadgeFor("crash", "stop",),).toBe("stopped",);
  expect(watchdogBadgeFor("crash", "wait",),).toBe("stopped",);
  expect(watchdogBadgeFor("probe", "restart",),).toBe("unknown",);
  expect(watchdogBadgeFor("other", "wait",),).toBe("unknown",);
});

test("the badge labels come from the catalog", () => {
  expect(watchdogBadgeLabel("watching",),).toBe("Watching",);
  expect(watchdogBadgeLabel("degraded",),).toBe("Degraded",);
  expect(watchdogBadgeLabel("restarting",),).toBe("Restarting",);
  expect(watchdogBadgeLabel("stopped",),).toBe("Stopped",);
  expect(watchdogBadgeLabel("unknown",),).toBe("Unknown",);
});

test("the write time is read as UTC, not as the viewer's local time", () => {
  expect(watchdogCreatedAtMs(row({ created_at: "2026-11-22 10:00:00", },),),).toBe(
    Date.parse("2026-11-22T10:00:00Z",),
  );
});

test("the state filter keeps only the matching rows", () => {
  const rows = [
    row({ id: 1, event_kind: "probe", decision_kind: "wait", },),
    row({ id: 2, event_kind: "crash", decision_kind: "restart", },),
  ];

  const kept = filterWatchdogEvents(rows, { state: "watching", since: "all", nowMs: NOW, },);
  expect(kept.map((r,) => r.id),).toEqual([1,],);
  expect(filterWatchdogEvents(rows, { state: "all", since: "all", nowMs: NOW, },),).toHaveLength(2,);
});

test("the recency filter keeps the rows written inside the window", () => {
  const rows = [
    row({ id: 1, created_at: "2026-11-22 11:50:00", },),
    row({ id: 2, created_at: "2026-11-22 09:00:00", },),
  ];

  const quarter = filterWatchdogEvents(rows, { state: "all", since: "15m", nowMs: NOW, },);
  expect(quarter.map((r,) => r.id),).toEqual([1,],);
  expect(filterWatchdogEvents(rows, { state: "all", since: "24h", nowMs: NOW, },),).toHaveLength(2,);
});

test("the panel loads the rows from the read route", async () => {
  handler = async () => Response.json({ data: [row({ id: 7, },),], },);
  const state = createAdminWatchdog();
  await state.init();
  expect(calls,).toEqual(["/api/v1/admin/watchdog/events?limit=200",],);
  expect(state.rows,).toHaveLength(1,);
  expect(state.loading,).toBe(false,);
  expect(state.error,).toBe("",);
});

test("the panel filters the loaded rows", async () => {
  handler = async () =>
    Response.json({
      data: [row({ id: 1, },), row({ id: 2, event_kind: "crash", decision_kind: "restart", },),],
    },);

  const state = createAdminWatchdog();
  await state.init();
  expect(state.visibleRows(),).toHaveLength(2,);
  state.stateFilter = "restarting";
  expect(state.visibleRows().map((r,) => r.id),).toEqual([2,],);
});

test("a 403 becomes an error state, not a crash", async () => {
  handler = async () => {
    throw Object.assign(new Error("Forbidden",), { status: 403, },);
  };

  const state = createAdminWatchdog();
  await state.init();
  expect(state.error,).toBe("You do not have access to the watchdog log.",);
  expect(state.rows,).toEqual([],);
  expect(state.loading,).toBe(false,);
});

test("a 401 becomes an error state, not a crash", async () => {
  handler = async () => {
    throw new Error("Unauthorized",);
  };

  const state = createAdminWatchdog();
  await state.init();
  expect(state.error,).toBe("Your session is not authorized for the watchdog log.",);
  expect(state.rows,).toEqual([],);
});

test("a server failure shows the server's own reason", async () => {
  handler = async () => {
    throw Object.assign(new Error("boom",), { status: 500, body: { error: "watchdog log unavailable", }, },);
  };

  const state = createAdminWatchdog();
  await state.init();
  expect(state.error,).toBe("watchdog log unavailable",);
});

test("a failure without a reason shows the generic message", async () => {
  handler = async () => {
    throw Object.assign(new Error("network down",), { status: 500, },);
  };

  const state = createAdminWatchdog();
  await state.init();
  expect(state.error,).toBe("Failed to load watchdog events.",);
});

test("a row with an unparseable write time is dropped by the recency filter", () => {
  const broken = row({ id: 3, created_at: "not-a-date", },);
  expect(watchdogCreatedAtMs(broken,),).toBeNaN();
  const kept = filterWatchdogEvents([broken,], { state: "all", since: "15m", nowMs: NOW, },);
  expect(kept,).toEqual([],);
});

test("the row badge is labeled and colored from its kinds", () => {
  const state = createAdminWatchdog();
  const stopped = row({ event_kind: "crash", decision_kind: "stop", },);
  expect(state.badgeFor(stopped,),).toBe("stopped",);
  expect(state.badgeLabel(stopped,),).toBe("Stopped",);
  expect(state.badgeColor(stopped,),).toContain("--color-danger",);
  expect(state.timeLabel(stopped,),).not.toBe("",);
});

test("the component is registered globally for the panel partial", () => {
  expect((globalThis as unknown as Record<string, unknown>).adminWatchdog,).toBe(createAdminWatchdog,);
});
