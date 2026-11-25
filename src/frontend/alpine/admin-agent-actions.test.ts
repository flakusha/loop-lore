// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, expect, test, } from "bun:test";
import type { ApiFetchMock, } from "../tests/test-types";
import {
  type AgentActionRow,
  agentActionsQuery,
  createAdminAgentActions,
  DEFAULT_LIMIT,
  MAX_LIMIT,
} from "./admin-agent-actions";

const g = globalThis as unknown as { apiFetch?: ApiFetchMock };
const originalFetch = g.apiFetch;

/** The only mutable test state; each test owns it via beforeEach. */
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

/** One audit row; fields irrelevant to a case get sane defaults. */
function row(overrides: Partial<AgentActionRow> = {},): AgentActionRow {
  return {
    id: 1,
    token_digest: "0123456789abcdef",
    user_id: null,
    action: "check",
    worktree_id: null,
    commit_hash: null,
    result: "ok",
    duration_ms: 12,
    metadata: null,
    created_at: "2026-11-25 10:00:00",
    ...overrides,
  };
}

test("query encoding omits blank filters and clamps the limit", () => {
  expect(agentActionsQuery({ token: "  ", action: " ", limit: 500, },),).toBe("limit=200",);
  expect(agentActionsQuery({ token: " a b ", action: "check", limit: 0, },),).toBe(
    "limit=1&token=a+b&action=check",
  );

  expect(agentActionsQuery({ limit: Number.NaN, },),).toBe("limit=50",);
});

test("limit bounds follow the exported route caps", () => {
  expect(DEFAULT_LIMIT,).toBe(50,);
  expect(MAX_LIMIT,).toBe(200,);
  expect(agentActionsQuery({},),).toBe(`limit=${DEFAULT_LIMIT}`,);
  expect(agentActionsQuery({ limit: 500, },),).toBe(`limit=${MAX_LIMIT}`,);
});

test("the panel loads rows from the admin audit route", async () => {
  handler = async () => Response.json({ data: [row(), row({ id: 2, action: "tickets", },),], },);
  const state = createAdminAgentActions();
  await state.load();
  expect(calls,).toEqual(["/api/v1/admin/agent-actions?limit=50",],);
  expect(state.rows.map((r,) => r.action),).toEqual(["check", "tickets",],);
  expect(state.error,).toBe("",);
});

test("filter inputs reach the route on reload", async () => {
  const state = createAdminAgentActions();
  state.token = "llri_secret";
  state.action = "check";
  await state.load();
  expect(calls,).toEqual(["/api/v1/admin/agent-actions?limit=50&token=llri_secret&action=check",],);
});

test("a denied load shows a distinct message and clears rows", async () => {
  // feFetch throws on non-2xx; the status rides on the thrown error.
  handler = async () => {
    throw Object.assign(new Error("Forbidden",), { status: 403, },);
  };

  const state = createAdminAgentActions();
  state.rows = [row(),];
  await state.load();
  expect(state.rows,).toEqual([],);
  expect(state.error,).toContain("do not have access",);
});

test("a malformed body yields an empty list, and the factory is globally registered", async () => {
  handler = async () => Response.json({ data: "not an array", },);
  const state = createAdminAgentActions();
  await state.init();
  expect(state.rows,).toEqual([],);
  expect((globalThis as unknown as Record<string, unknown>).adminAgentActions,).toBe(
    createAdminAgentActions,
  );
});
