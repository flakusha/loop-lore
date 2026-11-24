// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { t, } from "elysia";
import { routeSpec, } from "./route-spec";

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
});
