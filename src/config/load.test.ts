import { beforeAll, describe, expect, test, } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, } from "node:fs";
import { join, } from "node:path";
import { createLogger, } from "../logger";
import { coerceValue, deepMerge, loadConfig, setByPath, validateConfig, validateDatabaseSafety, } from "./load";
import type { Config, } from "./schema";
import { ConfigSchema, } from "./schema-class";

beforeAll(() => {
  // loadConfig → template expansion calls getLogger(), which throws unless a
  // root logger exists. Other tests initialize it as a module side effect;
  // --isolate processes skip that, so init here explicitly.
  createLogger({ level: "error", },);
},);

describe("DEFAULTS", () => {
  function defaults() {
    return structuredClone(new ConfigSchema().defaults,);
  }

  test("has all required config sections", () => {
    const cfg = defaults();
    expect(cfg.server,).toBeDefined();
    expect(cfg.db,).toBeDefined();
    expect(cfg.assets,).toBeDefined();
    expect(cfg.assistant,).toBeDefined();
    expect(cfg.logging,).toBeDefined();
    expect(cfg.tui,).toBeDefined();
    expect(cfg.docs,).toBeDefined();
  });

  test("server defaults to port 3000", () => {
    expect(defaults().server.port,).toBe(3000,);
  });

  test("db defaults to sqlite", () => {
    expect(defaults().db.type,).toBe("sqlite",);
  });

  test("defaults are deeply frozen-compatible (no shared references)", () => {
    const clone1 = defaults();
    const clone2 = defaults();
    clone1.server.port = 9999;
    expect(clone2.server.port,).toBe(3000,);
  });
});

describe("deepMerge", () => {
  test("merges nested objects recursively", () => {
    const base = { a: 1, nested: { x: 10, y: 20, }, };
    const override: Partial<typeof base> = { nested: { x: 10, y: 99, }, };
    const result = deepMerge(base, override,);
    expect(result,).toEqual({ a: 1, nested: { x: 10, y: 99, }, },);
  });

  test("scalar values override without merging", () => {
    const base = { name: "original", count: 5, };
    const override: Partial<typeof base> = { count: 10, };
    const result = deepMerge(base, override,);
    expect(result,).toEqual({ name: "original", count: 10, },);
  });

  test("undefined values in override are ignored", () => {
    const base = { a: 1, b: 2, };
    const override: Partial<typeof base> = { b: undefined, };
    const result = deepMerge(base, override,);
    expect(result,).toEqual({ a: 1, b: 2, },);
  });

  test("arrays are replaced, not merged", () => {
    const base = { items: [1, 2, 3,], };
    const override: Partial<typeof base> = { items: [4, 5,], };
    const result = deepMerge(base, override,);
    expect(result.items,).toEqual([4, 5,],);
  });

  test("null override replaces existing value", () => {
    const base: Record<string, unknown> = { value: "hello", };
    const override: Partial<typeof base> = { value: null, };
    const result = deepMerge(base, override,);
    expect(result.value,).toBeNull();
  });

  test("new keys from override are added", () => {
    const base: Record<string, unknown> = { a: 1, };
    const override: Partial<typeof base> = { b: 2, };
    const result = deepMerge(base, override,);
    expect(result,).toEqual({ a: 1, b: 2, },);
  });

  test("deep merge preserves untouched nested keys", () => {
    const base = { server: { port: 3000, host: "0.0.0.0", }, };
    const result = deepMerge(base, { server: { port: 8080, host: "0.0.0.0", }, },);
    expect(result,).toEqual({ server: { port: 8080, host: "0.0.0.0", }, },);
  });
});

describe("coerceValue", () => {
  test("parses number from string", () => {
    expect(coerceValue("8080", "number",),).toBe(8080,);
  });

  test("parses 'true' to boolean true", () => {
    expect(coerceValue("true", "boolean",),).toBe(true,);
  });

  test("parses '1' to boolean true", () => {
    expect(coerceValue("1", "boolean",),).toBe(true,);
  });

  test("parses 'false' to boolean false", () => {
    expect(coerceValue("false", "boolean",),).toBe(false,);
  });

  test("parses '0' to boolean false", () => {
    expect(coerceValue("0", "boolean",),).toBe(false,);
  });

  test("returns string as-is for string type", () => {
    expect(coerceValue("hello", "string",),).toBe("hello",);
  });

  test("returns non-boolean string for boolean target as-is", () => {
    expect(coerceValue("maybe", "boolean",),).toBe("maybe",);
  });
});

describe("setByPath", () => {
  test("sets value at nested path", () => {
    const object: Record<string, unknown> = {};
    setByPath(object, "server.port", 8080,);
    expect(object,).toEqual({ server: { port: 8080, }, },);
  });

  test("creates intermediate objects for path", () => {
    const object: Record<string, unknown> = {};
    setByPath(object, "a.b.c", "deep",);
    expect(object,).toEqual({ a: { b: { c: "deep", }, }, },);
  });

  test("overwrites existing scalar at path part with object", () => {
    const object: Record<string, unknown> = { existing: true, };
    setByPath(object, "existing.nested", "value",);
    expect(object,).toEqual({ existing: { nested: "value", }, },);
  });

  test("single-part path sets top-level key", () => {
    const object: Record<string, unknown> = {};
    setByPath(object, "key", "value",);
    expect(object,).toEqual({ key: "value", },);
  });
});

describe("validateConfig", () => {
  function validConfig(): Config {
    return structuredClone(new ConfigSchema().defaults,);
  }

  test("passes on valid defaults", () => {
    expect(() => {
      validateConfig(validConfig(),);
    },).not.toThrow();
  });

  test("throws on invalid db.type", () => {
    const config = validConfig();
    (config.db as unknown as Record<string, unknown>).type = "mysql";
    expect(() => {
      validateConfig(config,);
    },).toThrow(/db\.type/,);
  });

  test("throws on postgres without url", () => {
    const config = validConfig();
    config.db.type = "postgres";
    (config.db as unknown as Record<string, unknown>).url = undefined;
    expect(() => {
      validateConfig(config,);
    },).toThrow(/db\.url/,);
  });

  test("passes on postgres with url", () => {
    const config = validConfig();
    config.db.type = "postgres";
    config.db.url = "postgres://localhost:5432/test";
    expect(() => {
      validateConfig(config,);
    },).not.toThrow();
  });

  test("rejects port out of range", () => {
    const config = validConfig();
    config.server.port = -1;
    expect(() => {
      validateConfig(config,);
    },).toThrow(/port/,);
    config.server.port = 100_000;
    expect(() => {
      validateConfig(config,);
    },).toThrow(/port/,);
  });

  test("throws on port 65536", () => {
    const config = validConfig();
    config.server.port = 65_536;
    expect(() => {
      validateConfig(config,);
    },).toThrow(/port/,);
  });

  test("throws on invalid logging level", () => {
    const config = validConfig();
    config.logging.level = "trace" as "debug";
    expect(() => {
      validateConfig(config,);
    },).toThrow(/logging\.level/,);
  });
});

describe("Config layer merging", () => {
  test("deepMerge applies multiple layers in order", () => {
    const schema = { server: { port: 3000, host: "0.0.0.0", }, };
    const defaultConfig = { server: { port: 8080, }, };
    const localConfig = { server: { host: "127.0.0.1", }, };

    let result = deepMerge(schema as Record<string, unknown>, defaultConfig,) as typeof schema;
    result = deepMerge(result as Record<string, unknown>, localConfig,) as typeof schema;

    expect(result.server.port,).toBe(8080,); // from config.default
    expect(result.server.host,).toBe("127.0.0.1",); // from config.local
  });

  test("local override wins over default for same key", () => {
    const base = { server: { port: 3000, }, };
    const defaultConfig = { server: { port: 8080, }, };
    const localConfig = { server: { port: 9999, }, };

    let result = deepMerge(base, defaultConfig,);
    result = deepMerge(result, localConfig,);

    expect(result.server.port,).toBe(9999,);
  });

  test("undefined in local does not erase default value", () => {
    const base = { server: { port: 3000, }, };
    const defaultConfig = { server: { port: 8080, }, };
    const localConfig = { server: { port: undefined as unknown as number, }, };

    let result = deepMerge(base, defaultConfig,);
    result = deepMerge(result, localConfig,);

    expect(result.server.port,).toBe(8080,);
  });

  test("env.yaml layer overrides local config", () => {
    const base = { server: { port: 3000, }, };
    const defaultConfig = { server: { port: 8080, }, };
    const localConfig = { server: { port: 9999, }, };
    const envYaml = { server: { port: 4000, }, };

    let result = deepMerge(base, defaultConfig,);
    result = deepMerge(result, localConfig,);
    result = deepMerge(result, envYaml,);

    expect(result.server.port,).toBe(4000,);
  });

  test("env vars override all config layers", () => {
    const base = { server: { port: 3000, }, };
    const defaultConfig = { server: { port: 8080, }, };
    const localConfig = { server: { port: 9999, }, };
    const envYaml = { server: { port: 4000, }, };

    let result = deepMerge(base, defaultConfig,);
    result = deepMerge(result, localConfig,);
    result = deepMerge(result, envYaml,);

    // Simulate env var override
    (result.server as Record<string, unknown>).port = 5000;

    expect(result.server.port,).toBe(5000,);
  });
});

describe("loadConfig integration", () => {
  const tmpDir = join(import.meta.dir, "__test_config_tmp",);

  function setupConfigFiles(files: Record<string, string>,) {
    rmSync(tmpDir, { recursive: true, force: true, },);
    // Create all parent directories needed by file paths
    const dirs = new Set<string>();
    for (const name of Object.keys(files,)) {
      const dir = join(tmpDir, ...name.split("/",).slice(0, -1,),);
      if (dir !== tmpDir) { dirs.add(dir,); }
    }
    mkdirSync(tmpDir, { recursive: true, },);
    for (const dir of dirs) {
      mkdirSync(dir, { recursive: true, },);
    }
    for (const [name, content,] of Object.entries(files,)) {
      writeFileSync(join(tmpDir, name,), content,);
    }
  }

  function cleanup() {
    rmSync(tmpDir, { recursive: true, force: true, },);
  }

  test("loads config.toml from project root", () => {
    setupConfigFiles({
      "config.toml": `
[server]
port = 7171

[generation.autoStart.llamaSwap]
enabled = true
configPath = "/tmp/llama-swap.yaml"
`,
    },);
    try {
      const config = loadConfig(tmpDir,);
      expect(config.server.port,).toBe(7171,);
      expect(config.generation.autoStart?.llamaSwap?.enabled,).toBe(true,);
      expect(config.generation.autoStart?.llamaSwap?.configPath,).toBe("/tmp/llama-swap.yaml",);
    } finally {
      cleanup();
    }
  });

  test("loads config.yaml from configs/ subdirectory", () => {
    setupConfigFiles({
      "configs/config.yaml": `
server:
  port: 8282
`,
    },);
    try {
      const config = loadConfig(tmpDir,);
      expect(config.server.port,).toBe(8282,);
    } finally {
      cleanup();
    }
  });

  test("config.local.toml overrides config.toml", () => {
    setupConfigFiles({
      "config.toml": `
[server]
port = 7171
`,
      "config.local.toml": `
[server]
port = 9999
`,
    },);
    try {
      const config = loadConfig(tmpDir,);
      expect(config.server.port,).toBe(9999,);
    } finally {
      cleanup();
    }
  });

  test("config.default.toml is merged under config.toml", () => {
    setupConfigFiles({
      "config.default.toml": `
[server]
port = 5555
`,
      "config.toml": `
[server]
port = 7171
`,
    },);
    try {
      const config = loadConfig(tmpDir,);
      expect(config.server.port,).toBe(7171,);
    } finally {
      cleanup();
    }
  });

  test("missing config file uses schema defaults", () => {
    setupConfigFiles({},);
    try {
      const config = loadConfig(tmpDir,);
      expect(config.server.port,).toBe(3000,);
      expect(config.generation.autoStart,).toBeUndefined();
    } finally {
      cleanup();
    }
  });

  test("autoStart from config.toml survives deep merge", () => {
    setupConfigFiles({
      "config.toml": `
[generation.autoStart.llamaSwap]
enabled = true
configPath = "~/models/llama-swap.yaml"
`,
    },);
    try {
      const config = loadConfig(tmpDir,);
      expect(config.generation.autoStart,).toBeDefined();
      expect(config.generation.autoStart?.llamaSwap?.enabled,).toBe(true,);
      expect(config.generation.autoStart?.llamaSwap?.configPath,).toBe("~/models/llama-swap.yaml",);
    } finally {
      cleanup();
    }
  });
});

describe("validateDatabaseSafety", () => {
  function sqliteConfig(overrides?: Partial<Config["db"]>,): Config {
    const defaults = structuredClone(new ConfigSchema().defaults,);
    defaults.db.type = "sqlite";
    defaults.db.sqliteFilename = "/tmp/test.db";
    if (overrides) { Object.assign(defaults.db, overrides,); }
    return defaults;
  }

  test("allows sqlite with instance_count=1", () => {
    const original = process.env.INSTANCE_COUNT;
    try {
      process.env.INSTANCE_COUNT = "1";
      expect(() => {
        validateDatabaseSafety(sqliteConfig(),);
      },).not.toThrow();
    } finally {
      if (original === undefined) { delete process.env.INSTANCE_COUNT; }
      else { process.env.INSTANCE_COUNT = original; }
    }
  });

  test("rejects sqlite with instance_count > 1", () => {
    const original = process.env.INSTANCE_COUNT;
    try {
      process.env.INSTANCE_COUNT = "3";
      expect(() => {
        validateDatabaseSafety(sqliteConfig(),);
      },).toThrow(/not safe with 3 instances/,);
    } finally {
      if (original === undefined) { delete process.env.INSTANCE_COUNT; }
      else { process.env.INSTANCE_COUNT = original; }
    }
  });

  test("rejects sqlite when UNSAFE_SQLITE_MULTIINSTANCE is set", () => {
    const original = process.env.UNSAFE_SQLITE_MULTIINSTANCE;
    try {
      process.env.UNSAFE_SQLITE_MULTIINSTANCE = "true";
      expect(() => {
        validateDatabaseSafety(sqliteConfig(),);
      },).toThrow(/UNSAFE_SQLITE_MULTIINSTANCE=true is set/,);
    } finally {
      if (original === undefined) { delete process.env.UNSAFE_SQLITE_MULTIINSTANCE; }
      else { process.env.UNSAFE_SQLITE_MULTIINSTANCE = original; }
    }
  });

  test("allows postgres with any instance count", () => {
    const original = process.env.INSTANCE_COUNT;
    try {
      process.env.INSTANCE_COUNT = "10";
      const config = sqliteConfig({ type: "postgres", url: "postgresql://localhost/db", },);
      expect(() => {
        validateDatabaseSafety(config,);
      },).not.toThrow();
    } finally {
      if (original === undefined) { delete process.env.INSTANCE_COUNT; }
      else { process.env.INSTANCE_COUNT = original; }
    }
  });

  test("allows sqlite when INSTANCE_COUNT is unset (defaults to 1)", () => {
    const original = process.env.INSTANCE_COUNT;
    try {
      delete process.env.INSTANCE_COUNT;
      expect(() => {
        validateDatabaseSafety(sqliteConfig(),);
      },).not.toThrow();
    } finally {
      if (original === undefined) { delete process.env.INSTANCE_COUNT; }
      else { process.env.INSTANCE_COUNT = original; }
    }
  });
});
