// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
import { Elysia, t, } from "elysia";
import { describe, expect, expectTypeOf, test, } from "bun:test";
import { routeDetail, routeErrors, routeSpec, } from "./route-spec";

// Guard the root cause: passing a factory call as the whole options object
// loses Elysia's literal ctx inference. If routeSpec ever regains schema
// fields, this directive becomes unused and the typecheck gate fails.
function rejectWholeOptionsFactory() {
  routeSpec({
    // @ts-expect-error shared fragments only; schemas belong in the inline options literal
    params: t.Object({ id: t.String(), },),
    response: { 200: t.Object({ ok: t.Boolean(), },), },
    summary: "invalid",
    description: "invalid",
    tags: ["Things",],
  },);
}

void rejectWholeOptionsFactory;

describe("routeSpec", () => {
  test("injects standard auth errors and preserves declared responses", () => {
    const spec = routeSpec({
      response: { 200: t.Object({ data: t.Any(), },), },
      summary: "Read thing",
      description: "Reads one thing",
      tags: ["Things",],
    },);

    expect(Object.keys(spec.response,),).toEqual(["200", "401", "404",],);
    expect(spec.detail,).toEqual({
      summary: "Read thing",
      description: "Reads one thing",
      tags: ["Things",],
    },);
  });

  test("keeps unannotated Elysia handler ctx exact when spread inline", () => {
    const app = new Elysia().post(
      "/things/:id",
      (ctx,) => {
        expectTypeOf(ctx.params,).toEqualTypeOf<{ id: string }>();
        expectTypeOf(ctx.body,).toEqualTypeOf<{ name: string }>();
        expectTypeOf(ctx.query,).toEqualTypeOf<{ q: string }>();
        return { ok: true, };
      },
      {
        params: t.Object({ id: t.String(), },),
        body: t.Object({ name: t.String(), },),
        query: t.Object({ q: t.String(), },),
        ...routeSpec({
          response: { 200: t.Object({ ok: t.Boolean(), },), },
          summary: "Create thing",
          description: "Creates one thing",
          tags: ["Things",],
        },),
      },
    );

    expect(app,).toBeDefined();
  });

  test("inline helpers match routeSpec entries", () => {
    expect(routeErrors(),).toEqual({ 401: expect.anything(), 404: expect.anything(), },);
    expect(routeDetail({ summary: "Read thing", description: "Reads one thing", tags: ["Things",], },),).toEqual({
      detail: { summary: "Read thing", description: "Reads one thing", tags: ["Things",], },
    },);
  });
});
