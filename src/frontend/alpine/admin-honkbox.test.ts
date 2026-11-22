// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, expect, test, } from "bun:test";
import type { ApiFetchMock, } from "../tests/test-types";
import {
  type AdminHonkboxState,
  createAdminHonkbox,
  HONKBOX_STATUS_URL,
  type HonkboxStatus,
} from "./admin-honkbox";

const g = globalThis as unknown as { apiFetch?: ApiFetchMock };
const originalFetch = g.apiFetch;

/** Full served status, including the `meta` field the server adds. */
const AVAILABLE: HonkboxStatus & { meta?: unknown } = {
  configured: true,
  state: "available",
  availability: true,
  reason: null,
  gpuSlots: 2,
  queueWaitSecs: 45,
  retryAfterSecs: 5,
  jobsEnabled: true,
  eventsEnabled: true,
  toolsEnabled: true,
  externalTools: [{ id: "blender", available: true, }, { id: "ffmpeg", available: false, },],
  cached: true,
  meta: { version: 1, },
};

let urls: string[] = [];
let handler: ApiFetchMock = async () => Response.json({},);
let state: AdminHonkboxState;

beforeEach(() => {
  urls = [];
  handler = async () => Response.json({},);
  g.apiFetch = (url: string, opts?: RequestInit,) => {
    urls.push(url,);
    return handler(url, opts,);
  };

  state = createAdminHonkbox();
},);

afterEach(() => {
  g.apiFetch = originalFetch;
},);

test("loadStatus projects the contracted status fields", async () => {
  handler = async () => Response.json(AVAILABLE,);

  await state.init();

  expect(urls,).toEqual([HONKBOX_STATUS_URL,],);
  expect(state.error,).toBe("",);
  expect(state.status.configured,).toBe(true,);
  expect(state.status.state,).toBe("available",);
  expect(state.status.availability,).toBe(true,);
  expect(state.status.gpuSlots,).toBe(2,);
  expect(state.status.queueWaitSecs,).toBe(45,);
  expect(state.status.retryAfterSecs,).toBe(5,);
  expect(state.status.jobsEnabled,).toBe(true,);
  expect(state.status.externalTools,).toEqual([
    { id: "blender", available: true, },
    { id: "ffmpeg", available: false, },
  ],);

  expect(state.loading,).toBe(false,);
});

test("loadStatus keeps the explicit unavailable state from the server", async () => {
  handler = async () =>
    Response.json({
      configured: true,
      state: "unavailable",
      availability: false,
      reason: "unreachable",
      gpuSlots: null,
      queueWaitSecs: null,
      retryAfterSecs: null,
      externalTools: [],
    },);

  await state.loadStatus();

  expect(state.status.state,).toBe("unavailable",);
  expect(state.status.availability,).toBe(false,);
  expect(state.status.reason,).toBe("unreachable",);
  expect(state.status.gpuSlots,).toBeNull();
  expect(state.error,).toBe("",);
});

test("loadStatus surfaces an HTTP error without marking honkbox available", async () => {
  handler = async () => new Response(JSON.stringify({ message: "admin required", },), { status: 403, },);

  await state.loadStatus();

  expect(state.error,).toBe("admin required",);
  expect(state.status.state,).toBe("unavailable",);
  expect(state.status.availability,).toBe(false,);
  expect(state.loading,).toBe(false,);
});

test("loadStatus fails closed on a malformed response", async () => {
  handler = async () =>
    Response.json({ configured: true, state: "healthy", gpuSlots: "many", externalTools: [null,], },);

  await state.loadStatus();

  expect(state.status.state,).toBe("unavailable",);
  expect(state.status.configured,).toBe(true,);
  expect(state.status.gpuSlots,).toBeNull();
  expect(state.status.externalTools,).toEqual([],);
});
