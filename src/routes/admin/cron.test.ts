// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import { configSchema, } from "../../config/schema-class";
import { defineJob, setScheduler, startScheduler, } from "../../cron/registry";
import type { Db, } from "../../db";
import { createLogger, } from "../../logger";
import { cronRoutes, } from "./cron";

createLogger({ level: "fatal", },);

/** */
function mount(role: string | null,) {
  const app = new Elysia()
    .derive(() => ({ userId: "admin-1", userRole: role, }))
    .use(cronRoutes({ database: {} as Db, config: configSchema.defaults, },),);
  return app;
}

describe("admin cron routes", () => {
  test("GET jobs lists status; POST run triggers; non-admin forbidden", async () => {
    const scheduler = startScheduler({
      database: {} as Db,
      config: configSchema.defaults,
      logger: createLogger({ level: "fatal", },),
      jobs: [defineJob({ name: "a.job", schedule: "@hourly", enabled: true, run: async () => ({ ok: true, }), },),],
      cronImpl: () => {
        const handle = { stop: () => handle, ref: () => handle, unref: () => handle, };
        return handle;
      },
    },);
    try {
      const app = mount("admin",);
      const list = await app.handle(new Request("http://localhost/api/admin/cron/jobs",),);
      expect(list.status,).toBe(200,);
      const body = await list.json() as { name: string }[];
      expect(body.map((j,) => j.name),).toEqual(["a.job",],);

      const run = await app.handle(
        new Request("http://localhost/api/admin/cron/jobs/a.job/run", { method: "POST", },),
      );
      expect(run.status,).toBe(200,);

      const missing = await app.handle(
        new Request("http://localhost/api/admin/cron/jobs/nope/run", { method: "POST", },),
      );
      expect(missing.status,).toBe(404,);

      const denied = await mount("user",).handle(new Request("http://localhost/api/admin/cron/jobs",),);
      expect(denied.status,).toBe(403,);
    } finally {
      scheduler.stop();
    }
  });

  test("503 when scheduler not running", async () => {
    setScheduler(null,);
    const res = await mount("admin",).handle(new Request("http://localhost/api/admin/cron/jobs",),);
    expect(res.status,).toBe(503,);
  });
});
