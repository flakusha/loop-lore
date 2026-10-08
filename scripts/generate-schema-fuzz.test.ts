// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { TSchema, } from "@sinclair/typebox";
import { afterEach, describe, expect, test, } from "bun:test";
import type { Found, } from "./generate-schema-fuzz";
import { aliasFor, casesFor, titleFor, } from "./generate-schema-fuzz";

/** Stands in for real disk state: the `Found` rows `discoverSchemas` emits. */
const STRING_SCHEMA: TSchema = { type: "string", } as TSchema;
const DATE_SCHEMA: TSchema = { type: "string", format: "date-time", } as TSchema;

const RESPONSES: Found = {
  name: "ItemSchema",
  module: "validation/responses",
  duplicate: false,
  schema: STRING_SCHEMA,
};

const ADMIN: Found = {
  name: "ItemSchema",
  module: "validation/responses-admin",
  duplicate: true,
  schema: STRING_SCHEMA,
};

describe("aliasFor", () => {
  test("kebab-case module ids become camelCase identifiers", () => {
    expect(aliasFor("asset-tags",),).toBe("assetTags",);
  });

  test("every path separator becomes an underscore and only dashes camelCase", () => {
    // `routes/api-keys` → `routes_apiKeys`: `/` maps to `_`, `-` is the only
    // character camelCased. A non-global `.replace(/\//)` would leave a raw
    // `/` and emit an identifier that does not parse.
    expect(aliasFor("routes/api-keys",),).toBe("routes_apiKeys",);
    expect(/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(aliasFor("routes/api-keys",),),).toBe(true,);
    expect(aliasFor("a/b/c",),).toBe("a_b_c",);
  });

  test("nested scan-root module ids keep every separator handled", () => {
    // `SCAN_ROOTS` globs `routes/` RECURSIVELY, so real module ids carry 2+
    // slashes (`routes/blog/comments`). A non-global `.replace(/\//)` leaves
    // `routes_blog/comments` — an illegal identifier that breaks the import.
    // Only `-` camelCases; `/` maps to `_` (matches the committed artifact,
    // which imports `routes_blog_comments`).
    expect(aliasFor("routes/blog/comments",),).toBe("routes_blog_comments",);
    expect(aliasFor("routes/api/v1/items",),).toBe("routes_api_v1_items",);
    for (const id of ["routes/blog/comments", "routes/api/v1/items", "routes/asset-tags/helpers",]) {
      expect(/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(aliasFor(id,),),).toBe(true,);
    }
  });

  test("a leading digit is prefixed so the alias stays a legal identifier", () => {
    expect(aliasFor("4xx-errors",),).toBe("_4xxErrors",);
    expect(/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(aliasFor("4xx-errors",),),).toBe(true,);
  });

  test("the documented collision maps responses-admin and responsesAdmin alike", () => {
    // The alias is NOT injective; `discoverSchemas` rejects the clash before
    // render. This pins that the collision is real, not a stale doc claim.
    expect(aliasFor("responses-admin",),).toBe("responsesAdmin",);
    expect(aliasFor("responsesAdmin",),).toBe(aliasFor("responses-admin",),);
  });
});

describe("titleFor", () => {
  test("an unambiguous name renders bare", () => {
    expect(titleFor(RESPONSES,),).toBe("ItemSchema",);
  });

  test("a duplicated name is module-qualified", () => {
    expect(titleFor(ADMIN,),).toBe("ItemSchema [validation/responses-admin]",);
  });

  test("the same name in two modules yields two distinct titles", () => {
    // Without qualification both describes would be `describe("ItemSchema")`,
    // so one module's schema would silently resolve to whichever import won.
    const bare = { ...RESPONSES, duplicate: false, };
    expect(titleFor(bare,),).not.toBe(titleFor(ADMIN,),);
  });
});

describe("casesFor", () => {
  test("a JSON-round-trippable schema gets both cases", () => {
    const cases = casesFor(RESPONSES,);
    expect(cases.length,).toBe(3,);
    expect(cases.some((line,) => line.includes("accepts generated values",)),).toBe(true,);
    expect(cases.some((line,) => line.includes("survives a JSON round-trip",)),).toBe(true,);
  });

  test("a date schema gets the validity case only", () => {
    const cases = casesFor({ ...RESPONSES, schema: DATE_SCHEMA, },);
    expect(cases.some((line,) => line.includes("survives a JSON round-trip",)),).toBe(false,);
  });

  test("each case references its OWN module's alias", () => {
    // The cross-wiring bug: both modules exporting `ItemSchema` must not emit
    // the same `validation_responses.ItemSchema` reference.
    expect(casesFor(RESPONSES,)[0],).toContain("validation_responses.ItemSchema",);
    expect(casesFor(ADMIN,)[0],).toContain("validation_responsesAdmin.ItemSchema",);
  });
});

describe("idempotency", () => {
  test("the same discovered set renders identical cases and titles twice over", () => {
    // `render` itself is unexported — it shells out to dprint — so the pure
    // units that determine its bytes are pinned here instead.
    const rows = [RESPONSES, ADMIN,];
    const once = rows.map((row,) => [titleFor(row,), ...casesFor(row,),].join("\n",)).join("\n",);
    const twice = rows.map((row,) => [titleFor(row,), ...casesFor(row,),].join("\n",)).join("\n",);
    expect(once,).toBe(twice,);
  });
});

afterEach(() => {
  // no shared state to reset
},);
