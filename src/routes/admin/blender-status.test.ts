// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Admin surface tests use an injected discovery seam — no Blender process. */

import { expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { BlenderDiscoverySnapshot, } from "../../blender/discovery";
import type { Config, } from "../../config/schema";
import type { Db, } from "../../db";
import { type BlenderStatusRouteOpts, blenderStatusRoutes, } from "./blender-status";

const SNAPSHOT: BlenderDiscoverySnapshot = {
  probedAt: "2026-11-19T00:00:00.000Z",
  binary: "/opt/blender",
  ok: true,
  status: null,
  message: "",
  version: "4.5.15",
  stages: ["bake", "export-glb",],
  supported: true,
  provenance: null,
};

function makeApp(userRole: string | null, discover?: () => Promise<BlenderDiscoverySnapshot>,) {
  const app = new Elysia({ name: "test-blender-status", },);
  app.derive((): { userId: string | null; userRole: string | null } => ({
    userId: userRole ? "test-admin" : null,
    userRole,
  }));

  const opts: BlenderStatusRouteOpts = {
    database: {} as Db,
    config: {} as Config,
    ...(discover ? { discover, } : {}),
  };

  return app.use(blenderStatusRoutes(opts, "/api",),);
}

test("GET /api/admin/blender-status requires admin.system", async () => {
  const anonymous = makeApp(null,);
  const plain = makeApp("user",);
  const url = "http://localhost/api/admin/blender-status";
  expect((await anonymous.handle(new Request(url,),)).status,).toBe(401,);
  expect((await plain.handle(new Request(url,),)).status,).toBe(403,);
});

test("GET /api/admin/blender-status reports the cached verdict", async () => {
  let calls = 0;
  const app = makeApp("admin", async () => {
    calls += 1;
    return SNAPSHOT;
  },);

  const res = await app.handle(new Request("http://localhost/api/admin/blender-status",),);
  expect(res.status,).toBe(200,);
  const body = await res.json() as BlenderDiscoverySnapshot;
  expect(body.binary,).toBe("/opt/blender",);
  expect(body.version,).toBe("4.5.15",);
  expect(body.stages,).toEqual(["bake", "export-glb",],);
  expect(calls,).toBe(1,);
});
