// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Schema regression tests for BUG-t-any-schemas-persist-arbitrary-json-actor-settings-entity-d.
 *
 * `ActorUpdateBody.settings`, `EntityCreateBody.data`, and `EntityUpdateBody.data`
 * previously accepted `t.Any()`, which let clients POST arrays, primitives, or
 * arbitrary nested shapes to be JSON-stringified and stored. The fix tightens
 * these to `t.Record(t.String(), t.Any(),)` (project convention) — top-level
 * objects only; arrays/primitives/strings/numbers/booleans/null are rejected.
 */

import { describe, expect, test, } from "bun:test";
import { Value, } from "@sinclair/typebox/value";
import { ActorUpdateBody, } from "./actors";
import { EntityCreateBody, EntityUpdateBody, } from "./entities";

describe("ActorUpdateBody.settings", () => {
  test("accepts an empty object", () => {
    expect(Value.Check(ActorUpdateBody, { settings: {}, },),).toBe(true,);
  });

  test("accepts an object with arbitrary string keys", () => {
    expect(
      Value.Check(ActorUpdateBody, { settings: { tags: ["x",], strength: 10, nested: { a: 1, }, }, },),
    ).toBe(true,);
  });

  test("accepts undefined (field is optional)", () => {
    expect(Value.Check(ActorUpdateBody, { settings: undefined, },),).toBe(true,);
  });

  test("rejects a top-level array", () => {
    expect(Value.Check(ActorUpdateBody, { settings: ["a", "b",], },),).toBe(false,);
  });

  test("rejects a top-level string", () => {
    expect(Value.Check(ActorUpdateBody, { settings: "{}", },),).toBe(false,);
  });

  test("rejects a top-level number", () => {
    expect(Value.Check(ActorUpdateBody, { settings: 42, },),).toBe(false,);
  });

  test("rejects a top-level boolean", () => {
    expect(Value.Check(ActorUpdateBody, { settings: true, },),).toBe(false,);
  });

  test("rejects a top-level null", () => {
    expect(Value.Check(ActorUpdateBody, { settings: null, },),).toBe(false,);
  });
});

describe("EntityCreateBody.data", () => {
  test("accepts an object", () => {
    expect(Value.Check(EntityCreateBody, { data: { key: "value", n: 1, }, },),).toBe(true,);
  });

  test("rejects a top-level array", () => {
    expect(Value.Check(EntityCreateBody, { data: [1, 2, 3,], },),).toBe(false,);
  });

  test("rejects a top-level string", () => {
    expect(Value.Check(EntityCreateBody, { data: "raw", },),).toBe(false,);
  });

  test("rejects a top-level number", () => {
    expect(Value.Check(EntityCreateBody, { data: 99, },),).toBe(false,);
  });

  test("accepts undefined", () => {
    expect(Value.Check(EntityCreateBody, { data: undefined, },),).toBe(true,);
  });
});

describe("EntityUpdateBody.data", () => {
  test("accepts an object", () => {
    expect(
      Value.Check(EntityUpdateBody, { data: { pinned_at: "2026-09-15", meta: { a: 1, }, }, },),
    ).toBe(true,);
  });

  test("rejects a top-level array", () => {
    expect(Value.Check(EntityUpdateBody, { data: ["x",], },),).toBe(false,);
  });

  test("rejects a top-level string", () => {
    expect(Value.Check(EntityUpdateBody, { data: "raw", },),).toBe(false,);
  });

  test("rejects a top-level null", () => {
    expect(Value.Check(EntityUpdateBody, { data: null, },),).toBe(false,);
  });
});
