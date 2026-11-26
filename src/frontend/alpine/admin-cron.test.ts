// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import "./i18n.test-helper";
import { afterEach, beforeEach, expect, test, } from "bun:test";
import type { ApiFetchMock, } from "../tests/test-types";
import { adminCron, type CronJobStatus, } from "./admin-cron";

const g = globalThis as unknown as { apiFetch?: ApiFetchMock; showToast?: (...args: unknown[]) => void };
const originalFetch = g.apiFetch;
const originalToast = g.showToast;

const JOBS: CronJobStatus[] = [
  {
    name: "telemetry.retention",
    schedule: "@daily",
    enabled: true,
    lastRunAt: null,
    nextRunAt: "2026-01-01T00:00:00Z",
  },
  { name: "memory.decay", schedule: "@hourly", enabled: false, lastRunAt: "2025-12-31T12:00:00Z", nextRunAt: null, },
];

let calls: { url: string; opts?: RequestInit }[] = [];
let handler: ApiFetchMock = async () => Response.json([],);
let toasts: { kind: string; message: string }[] = [];

beforeEach(() => {
  calls = [];
  toasts = [];
  handler = async () => Response.json([],);
  g.apiFetch = (url, opts,) => {
    calls.push({ url, opts, },);
    return handler(url, opts,);
  };

  g.showToast = (...args: unknown[]) => {
    toasts.push({ kind: String(args[0],), message: String(args[1],), },);
  };

  adminCron.cronJobs = [];
  adminCron.cronSchedulerUnavailable = false;
  adminCron.cronError = "";
  adminCron.runningCronJob = "";
},);

afterEach(() => {
  g.apiFetch = originalFetch;
  g.showToast = originalToast;
},);

test("loadCronJobs stores the job statuses", async () => {
  handler = async () => Response.json(JOBS,);

  await adminCron.loadCronJobs();

  expect(adminCron.cronJobs,).toEqual(JOBS,);
  expect(adminCron.cronSchedulerUnavailable,).toBe(false,);
  expect(adminCron.cronError,).toBe("",);
  expect(adminCron.loadingCronJobs,).toBe(false,);
  expect(calls[0]?.url,).toBe("/api/v1/admin/cron/jobs",);
});

test("a 503 marks the scheduler unavailable instead of an error", async () => {
  handler = async () => Response.json({ message: "Scheduler not running", }, { status: 503, },);

  await adminCron.loadCronJobs();

  expect(adminCron.cronSchedulerUnavailable,).toBe(true,);
  expect(adminCron.cronJobs,).toEqual([],);
  expect(adminCron.cronError,).toBe("",);
});

test("loadCronJobs surfaces a non-503 failure through the generic error", async () => {
  handler = async () => Response.json({ message: "forbidden", }, { status: 403, },);

  await adminCron.loadCronJobs();

  expect(adminCron.cronSchedulerUnavailable,).toBe(false,);
  expect(adminCron.cronError,).not.toBe("",);
});

test("runCronJob POSTs the run route and reloads statuses", async () => {
  handler = async (url,) =>
    url === "/api/v1/admin/cron/jobs/memory.decay/run"
      ? Response.json({ name: "memory.decay", result: null, },)
      : Response.json(JOBS,);

  await adminCron.runCronJob("memory.decay",);

  expect(calls[0]?.url,).toBe("/api/v1/admin/cron/jobs/memory.decay/run",);
  expect(calls[0]?.opts?.method,).toBe("POST",);
  expect(toasts[0]?.kind,).toBe("success",);
  expect(adminCron.cronJobs,).toEqual(JOBS,);
  expect(adminCron.runningCronJob,).toBe("",);
});

test("runCronJob treats a 503 as scheduler-unavailable, not a generic failure", async () => {
  handler = async () => Response.json({ message: "Scheduler not running", }, { status: 503, },);

  await adminCron.runCronJob("memory.decay",);

  expect(adminCron.cronSchedulerUnavailable,).toBe(true,);
  expect(toasts[0]?.message,).toContain("Scheduler not running",);
});

test("runCronJob surfaces a failed run with the server message", async () => {
  handler = async () => Response.json({ message: "Unknown cron job x", }, { status: 404, },);

  await adminCron.runCronJob("memory.decay",);

  expect(toasts[0]?.kind,).toBe("error",);
  expect(toasts[0]?.message,).toContain("Unknown cron job x",);
  expect(adminCron.runningCronJob,).toBe("",);
});
