// SPDX-License-Identifier: Apache-2.0

/**
 * Shared plugin validation layer — the parsing every plugin route and tool
 * goes through. The message map decides what a rejected field says; the first
 * failing field decides which one speaks.
 */

import { describe, test, expect } from "bun:test";
import { Type } from "@sinclair/typebox";
import { parseSchema, readJsonBody } from "./validation";

const Sample = Type.Object({
  name: Type.String(),
  count: Type.Integer({ minimum: 1, maximum: 10 }),
});

describe("parseSchema", () => {
  test("returns the typed value for a valid payload", () => {
    const result = parseSchema(Sample, { name: "x", count: 3 });
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.count).toBe(3);
  });

  test("uses the field message for the failing field", () => {
    const result = parseSchema(Sample, { name: "x", count: 99 }, { count: "count must be 1-10" });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBe("count must be 1-10");
  });

  test("falls back to the schema message when the field has no message", () => {
    const result = parseSchema(Sample, { name: 42, count: 3 });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("name");
  });

  test("reports the first failing field", () => {
    const result = parseSchema(Sample, { name: 42, count: 99 }, {
      name: "bad name",
      count: "bad count",
    });
    expect(result.ok === false && result.error).toBe("bad name");
  });
});

describe("readJsonBody", () => {
  test("parses a JSON body", async () => {
    const result = await readJsonBody(
      new Request("http://x/", { method: "POST", body: JSON.stringify({ a: 1 }) }),
    );
    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toEqual({ a: 1 });
  });

  test("treats an empty body as no fields", async () => {
    const result = await readJsonBody(new Request("http://x/", { method: "POST" }));
    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toBeUndefined();
  });

  test("rejects a body that is not JSON", async () => {
    const result = await readJsonBody(new Request("http://x/", { method: "POST", body: "not-json" }));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBe("Invalid JSON body");
  });
});
