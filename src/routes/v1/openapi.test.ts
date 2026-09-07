// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import { buildVersionedOpenApiSpec, versionedOpenApiPlugin, } from "./openapi";

describe("buildVersionedOpenApiSpec", () => {
  test("builds a versioned server URL with empty paths", () => {
    const spec = buildVersionedOpenApiSpec({ version: "1", },);
    expect(spec.openapi,).toBe("3.1.0",);
    expect(spec.info.version,).toBe("1",);
    expect(spec.servers[0]?.url,).toBe("/api/v1",);
    expect(spec.paths,).toEqual({},);
  });

  test("honours a custom title", () => {
    const spec = buildVersionedOpenApiSpec({ version: "2", title: "Custom", },);
    expect(spec.info.title,).toBe("Custom",);
    expect(spec.servers[0]?.url,).toBe("/api/v2",);
  });
});

describe("versionedOpenApiPlugin", () => {
  test("GET /api/v1/openapi/json returns 200 with versioned servers and probe path", async () => {
    const app = new Elysia()
      .use(versionedOpenApiPlugin({ version: "1", },),)
      .get("/probe", () => ({ ok: true, }), {
        detail: {
          summary: "Probe route",
          tags: ["Probe",],
        },
      },);

    const res = await app.handle(new Request("http://localhost/api/v1/openapi/json",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as Record<string, unknown>;
    expect((body.openapi as string).startsWith("3.1.",),).toBe(true,);
    expect((body.info as Record<string, unknown>).version,).toBe("1",);
    const servers = body.servers as Array<Record<string, unknown>>;
    expect(servers[0]?.url,).toBe("/api/v1",);
    const paths = body.paths as Record<string, unknown>;
    expect("/probe" in paths,).toBe(true,);
  });

  test("GET /api/v1/openapi returns HTML (Scalar UI)", async () => {
    const app = new Elysia()
      .use(versionedOpenApiPlugin({ version: "1", },),)
      .get("/probe", () => ({ ok: true, }), {
        detail: { summary: "Probe", tags: ["Probe",], },
      },);

    const res = await app.handle(new Request("http://localhost/api/v1/openapi",),);
    expect(res.status,).toBe(200,);
    const contentType = res.headers.get("content-type",) ?? "";
    expect(contentType.startsWith("text/html",),).toBe(true,);
    const text = await res.text();
    expect(text.length,).toBeGreaterThan(100,);
  });
});
