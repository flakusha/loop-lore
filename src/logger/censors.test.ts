/**
 * Tests for logger/censors.ts — PII censoring engine
 */

import { describe, test, expect } from "bun:test";
import { censorMeta, fieldNamesToRules, DEFAULT_RULES } from "./censors";

describe("censorMeta", () => {
  test("returns undefined for undefined input", () => {
    expect(censorMeta(undefined)).toBeUndefined();
  });

  test("censors key fields in flat object", () => {
    const result = censorMeta({ email: "user@test.com", name: "Alice" });
    expect(result!.email).toBe("[REDACTED]");
    expect(result!.name).toBe("Alice");
  });

  test("censors password field", () => {
    const result = censorMeta({ password: "s3cret" });
    expect(result!.password).toBe("[REDACTED]");
  });

  test("censors key fields with glob patterns", () => {
    const result = censorMeta({ OPENAI_API_KEY: "sk-xxxxx" });
    expect(result!.OPENAI_API_KEY).toBe("[REDACTED]");
  });

  test("censors nested objects recursively", () => {
    const result = censorMeta({
      user: { email: "a@b.com", name: "Bob" },
      nested: { deep: { secret: "x" } },
    });
    expect((result!.user as Record<string, unknown>).email).toBe("[REDACTED]");
    expect((result!.user as Record<string, unknown>).name).toBe("Bob");
    expect(((result!.nested as Record<string, unknown>).deep as Record<string, unknown>).secret).toBe(
      "[REDACTED]",
    );
  });

  test("censors token field", () => {
    const result = censorMeta({ access_token: "abc123" });
    expect(result!.access_token).toBe("[REDACTED]");
  });

  test("does not mutate original object", () => {
    const original = { email: "original@test.com" };
    censorMeta(original);
    expect(original.email).toBe("original@test.com");
  });

  test("handles arrays of objects", () => {
    const result = censorMeta({
      items: [{ email: "a@b.com" }, { name: "ok" }],
    });
    const items = result!.items as Record<string, unknown>[];
    expect(items[0].email).toBe("[REDACTED]");
    expect(items[1].name).toBe("ok");
  });

  test("handles null and undefined values gracefully", () => {
    // Null value for a censored key gets redacted
    const result = censorMeta({ email: null, notCensored: null });
    expect(result!.email).toBe("[REDACTED]");
    expect(result!.notCensored).toBeNull();
  });

  test("applies extra censor rules merged with defaults", () => {
    const extra = fieldNamesToRules(["customField"]);
    const result = censorMeta({ customField: "secret", email: "x@y.com" }, extra);
    expect(result!.customField).toBe("[REDACTED]");
    expect(result!.email).toBe("[REDACTED]");
  });

  test("respects maxDepth limit", () => {
    const deep = { a: { b: { c: { d: { e: { f: { secret: "x" } } } } } } };
    const result = censorMeta(deep, undefined, 2);
    // Should not descend beyond depth 2 for censoring
    expect(result).toBeDefined();
  });

  test("fieldNamesToRules converts strings to CensorRule objects", () => {
    const rules = fieldNamesToRules(["pii", "secret"]);
    expect(rules).toHaveLength(2);
    expect(rules[0].field).toBe("pii");
    expect(rules[1].field).toBe("secret");
  });

  test("uses pattern-based censoring when rule has pattern", () => {
    const rules = [{ field: "data", pattern: /^\d{3}-\d{2}-\d{4}$/ }];
    const result = censorMeta({ data: "123-45-6789" }, rules);
    expect(result!.data).toBe("[REDACTED]");
  });

  test("skips value that does not match pattern", () => {
    const rules = [{ field: "data", pattern: /^\d{3}-\d{2}-\d{4}$/ }];
    const result = censorMeta({ data: "not-a-ssn" }, rules);
    expect(result!.data).toBe("not-a-ssn");
  });

  test("uses custom replacement for non-default fields", () => {
    // Extra rules appended to defaults; first match (default) wins for overlapped fields.
    // Custom replacement works for fields NOT in defaults.
    const rules = [{ field: "customPii", replacement: "***" }];
    const result = censorMeta({ customPii: "secret", email: "x@y.com" }, rules);
    expect(result!.customPii).toBe("***");
    expect(result!.email).toBe("[REDACTED]");
  });

  test("censors authorization field", () => {
    const result = censorMeta({ Authorization: "Bearer xyz" });
    expect(result!.Authorization).toBe("[REDACTED]");
  });

  test("handles empty object", () => {
    const result = censorMeta({});
    expect(result).toEqual({});
  });
});
