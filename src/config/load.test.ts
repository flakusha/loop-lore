import { describe, test, expect } from "bun:test";
import { ConfigSchema } from "./schema-class";
import type { Config } from "./schema";
import { deepMerge, validateConfig, coerceValue, setByPath } from "./load";

describe("DEFAULTS", () => {
  function defaults() {
    return structuredClone(new ConfigSchema().defaults);
  }

  test("has all required config sections", () => {
    const cfg = defaults();
    expect(cfg.server).toBeDefined();
    expect(cfg.db).toBeDefined();
    expect(cfg.assets).toBeDefined();
    expect(cfg.assistant).toBeDefined();
    expect(cfg.logging).toBeDefined();
    expect(cfg.tui).toBeDefined();
    expect(cfg.docs).toBeDefined();
  });

  test("server defaults to port 3000", () => {
    expect(defaults().server.port).toBe(3000);
  });

  test("db defaults to sqlite", () => {
    expect(defaults().db.type).toBe("sqlite");
  });

  test("defaults are deeply frozen-compatible (no shared references)", () => {
    const clone1 = defaults();
    const clone2 = defaults();
    clone1.server.port = 9999;
    expect(clone2.server.port).toBe(3000);
  });
});

describe("deepMerge", () => {
  test("merges nested objects recursively", () => {
    const base = { a: 1, nested: { x: 10, y: 20 } };
    const override: Partial<typeof base> = { nested: { x: 10, y: 99 } };
    const result = deepMerge(base, override);
    expect(result).toEqual({ a: 1, nested: { x: 10, y: 99 } });
  });

  test("scalar values override without merging", () => {
    const base = { name: "original", count: 5 };
    const override: Partial<typeof base> = { count: 10 };
    const result = deepMerge(base, override);
    expect(result).toEqual({ name: "original", count: 10 });
  });

  test("undefined values in override are ignored", () => {
    const base = { a: 1, b: 2 };
    const override: Partial<typeof base> = { b: undefined };
    const result = deepMerge(base, override);
    expect(result).toEqual({ a: 1, b: 2 });
  });

  test("arrays are replaced, not merged", () => {
    const base = { items: [1, 2, 3] };
    const override: Partial<typeof base> = { items: [4, 5] };
    const result = deepMerge(base, override);
    expect(result.items).toEqual([4, 5]);
  });

  test("null override replaces existing value", () => {
    const base: Record<string, unknown> = { value: "hello" };
    const override: Partial<typeof base> = { value: null };
    const result = deepMerge(base, override);
    expect(result.value).toBeNull();
  });

  test("new keys from override are added", () => {
    const base: Record<string, unknown> = { a: 1 };
    const override: Partial<typeof base> = { b: 2 };
    const result = deepMerge(base, override);
    expect(result).toEqual({ a: 1, b: 2 });
  });

  test("deep merge preserves untouched nested keys", () => {
    const base = { server: { port: 3000, host: "0.0.0.0" } };
    const result = deepMerge(base, { server: { port: 8080, host: "0.0.0.0" } });
    expect(result).toEqual({ server: { port: 8080, host: "0.0.0.0" } });
  });
});

describe("coerceValue", () => {
  test("parses number from string", () => {
    expect(coerceValue("8080", "number")).toBe(8080);
  });

  test("parses 'true' to boolean true", () => {
    expect(coerceValue("true", "boolean")).toBe(true);
  });

  test("parses '1' to boolean true", () => {
    expect(coerceValue("1", "boolean")).toBe(true);
  });

  test("parses 'false' to boolean false", () => {
    expect(coerceValue("false", "boolean")).toBe(false);
  });

  test("parses '0' to boolean false", () => {
    expect(coerceValue("0", "boolean")).toBe(false);
  });

  test("returns string as-is for string type", () => {
    expect(coerceValue("hello", "string")).toBe("hello");
  });

  test("returns non-boolean string for boolean target as-is", () => {
    expect(coerceValue("maybe", "boolean")).toBe("maybe");
  });
});

describe("setByPath", () => {
  test("sets value at nested path", () => {
    const object: Record<string, unknown> = {};
    setByPath(object, "server.port", 8080);
    expect(object).toEqual({ server: { port: 8080 } });
  });

  test("creates intermediate objects for path", () => {
    const object: Record<string, unknown> = {};
    setByPath(object, "a.b.c", "deep");
    expect(object).toEqual({ a: { b: { c: "deep" } } });
  });

  test("overwrites existing scalar at path part with object", () => {
    const object: Record<string, unknown> = { existing: true };
    setByPath(object, "existing.nested", "value");
    expect(object).toEqual({ existing: { nested: "value" } });
  });

  test("single-part path sets top-level key", () => {
    const object: Record<string, unknown> = {};
    setByPath(object, "key", "value");
    expect(object).toEqual({ key: "value" });
  });
});

describe("validateConfig", () => {
  function validConfig(): Config {
    return structuredClone(new ConfigSchema().defaults);
  }

  test("passes on valid defaults", () => {
    expect(() => {
      validateConfig(validConfig());
    }).not.toThrow();
  });

  test("throws on invalid db.type", () => {
    const config = validConfig();
    (config.db as unknown as Record<string, unknown>).type = "mysql";
    expect(() => {
      validateConfig(config);
    }).toThrow(/db\.type/);
  });

  test("throws on postgres without url", () => {
    const config = validConfig();
    config.db.type = "postgres";
    (config.db as unknown as Record<string, unknown>).url = undefined;
    expect(() => {
      validateConfig(config);
    }).toThrow(/db\.url/);
  });

  test("passes on postgres with url", () => {
    const config = validConfig();
    config.db.type = "postgres";
    config.db.url = "postgres://localhost:5432/test";
    expect(() => {
      validateConfig(config);
    }).not.toThrow();
  });

  test("rejects port out of range", () => {
    const config = validConfig();
    config.server.port = -1;
    expect(() => {
      validateConfig(config);
    }).toThrow(/port/);
    config.server.port = 100_000;
    expect(() => {
      validateConfig(config);
    }).toThrow(/port/);
  });

  test("throws on port 65536", () => {
    const config = validConfig();
    config.server.port = 65_536;
    expect(() => {
      validateConfig(config);
    }).toThrow(/port/);
  });

  test("throws on invalid logging level", () => {
    const config = validConfig();
    config.logging.level = "trace" as "debug";
    expect(() => {
      validateConfig(config);
    }).toThrow(/logging\.level/);
  });
});
