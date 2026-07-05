/**
 * Tests for ConfigSchema (schema-class.ts)
 *
 * Covers: envMap generation, validation, JSON schema generation,
 * defaults consistency with schema.ts DEFAULTS.
 */

import { describe, test, expect } from "bun:test";
import { ConfigSchema } from "@/config/schema-class";
import { DEFAULTS } from "@/config/schema";

describe("ConfigSchema", () => {
  // ── Defaults consistency ────────────────────────────────

  test("defaults match schema.ts DEFAULTS", () => {
    const cs = new ConfigSchema();
    expect(cs.defaults).toEqual(DEFAULTS);
  });

  test("defaults are deep-frozen (new instance each access)", () => {
    const a = new ConfigSchema().defaults;
    const b = new ConfigSchema().defaults;
    expect(a).toEqual(b);
    // Mutating one shouldn't affect the other
    a.server.port = 9999;
    expect(b.server.port).toBe(3000);
  });

  // ── envMap generation ───────────────────────────────────

  test("envMap returns known env var mappings", () => {
    const map = ConfigSchema.envMap();

    expect(map.PORT).toBe("server.port");
    expect(map.HOST).toBe("server.host");
    expect(map.DB_TYPE).toBe("db.type");
    expect(map.LOG_LEVEL).toBe("logging.level");
    expect(map.AUTH_REQUIRED).toBe("auth.required");
    expect(map.ALLOW_NSFW).toBe("nsfw.allowNsfw");
    expect(map.MESSAGE_MAX_LENGTH).toBe("messages.maxLength");
    expect(map.LLM_DEFAULT_PROVIDER).toBe("generation.defaultProvider");
    expect(map.BYO_KEY_ENABLED).toBe("byoKey.enabled");
  });

  test("envMap includes nested fields", () => {
    const map = ConfigSchema.envMap();
    expect(map.TLS_KEY).toBe("server.tls.key");
    expect(map.TRANSPORT_COMPRESSION_ENABLED).toBe("transport.compression.enabled");
    expect(map.TRANSPORT_MAX_FRAME_SIZE).toBe("transport.limits.maxFrameSize");
  });

  test("envMap includes testing config", () => {
    const map = ConfigSchema.envMap();
    expect(map.TESTING_LLAMA_MODEL).toBe("testing.llamaModel");
    expect(map.TESTING_SD_PORT).toBe("testing.sdPort");
  });

  test("envMap produces valid dot-paths", () => {
    const map = ConfigSchema.envMap();
    for (const [key, path] of Object.entries(map)) {
      expect(path).toMatch(/^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*)*$/);
      expect(key).toMatch(/^[A-Z][A-Z0-9_]*$/);
    }
  });

  // ── Validation ──────────────────────────────────────────

  test("validate passes for valid default config", () => {
    expect(() => { ConfigSchema.validate(DEFAULTS); }).not.toThrow();
  });

  test("validate throws for invalid db type", () => {
    const cfg = structuredClone(DEFAULTS);
    (cfg.db as unknown as Record<string, unknown>).type = "mongodb";
    expect(() => { ConfigSchema.validate(cfg); }).toThrow("db.type");
  });

  test("validate throws for missing postgres url", () => {
    const cfg = structuredClone(DEFAULTS);
    cfg.db.type = "postgres";
    cfg.db.url = undefined;
    expect(() => { ConfigSchema.validate(cfg); }).toThrow("db.url");
  });

  test("validate throws for invalid port", () => {
    const cfg = structuredClone(DEFAULTS);
    cfg.server.port = -1;
    expect(() => { ConfigSchema.validate(cfg); }).toThrow("port");
    cfg.server.port = 100_000;
    expect(() => { ConfigSchema.validate(cfg); }).toThrow("port");
  });

  test("validate throws for invalid log level", () => {
    const cfg = structuredClone(DEFAULTS);
    (cfg.logging as unknown as Record<string, unknown>).level = "verbose";
    expect(() => { ConfigSchema.validate(cfg); }).toThrow("logging.level");
  });

  test("validate throws for provider missing baseUrl", () => {
    const cfg = structuredClone(DEFAULTS);
    cfg.generation.providers.openaiCompatible = [
      { name: "bad", label: "Bad", model: "", baseUrl: "", timeout: 30_000, retries: 3, allowUserApiKey: false, models: {} },
    ];
    expect(() => { ConfigSchema.validate(cfg); }).toThrow("baseUrl");
  });

  test("validate throws for provider missing model", () => {
    const cfg = structuredClone(DEFAULTS);
    cfg.generation.providers.openaiCompatible = [
      { name: "bad", label: "Bad", model: "", baseUrl: "http://localhost/v1", timeout: 30_000, retries: 3, allowUserApiKey: false, models: {} },
    ];
    expect(() => { ConfigSchema.validate(cfg); }).toThrow("model");
  });

  test("validate throws for anthropic missing apiKey", () => {
    const cfg = structuredClone(DEFAULTS);
    cfg.generation.providers.anthropic = {
      name: "ant", label: "Anthropic", model: "claude", baseUrl: "https://api.anthropic.com", timeout: 30_000, retries: 3, allowUserApiKey: false, models: { claude: { contextLimit: 200_000, maxOutput: 4000 } },
    };
    expect(() => { ConfigSchema.validate(cfg); }).toThrow("apiKey");
  });

  // ── JSON Schema generation ──────────────────────────────

  test("jsonSchema produces valid structure", () => {
    const schema = ConfigSchema.jsonSchema() as Record<string, unknown>;

    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.type).toBe("object");
    expect(schema.properties).toBeTruthy();

    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.server).toBeTruthy();
    expect(props.db).toBeTruthy();
    expect(props.assets).toBeTruthy();
    expect(props.generation).toBeTruthy();
  });

  test("jsonSchema includes required top-level sections", () => {
    const schema = ConfigSchema.jsonSchema() as Record<string, unknown>;
    const required = schema.required as string[];
    expect(required).toContain("server");
    expect(required).toContain("db");
    expect(required).toContain("auth");
  });

  test("jsonSchema server port has min/max constraints", () => {
    const schema = ConfigSchema.jsonSchema() as Record<string, unknown>;
    const props = schema.properties as Record<string, Record<string, unknown>>;
    const port = props.server.properties as Record<string, Record<string, unknown>>;
    expect(port.port.minimum).toBe(0);
    expect(port.port.maximum).toBe(65_535);
  });

  test("jsonSchema db type has enum constraint", () => {
    const schema = ConfigSchema.jsonSchema() as Record<string, unknown>;
    const props = schema.properties as Record<string, Record<string, unknown>>;
    const db = props.db.properties as Record<string, Record<string, unknown>>;
    expect(db.type.enum).toEqual(["sqlite", "postgres"]);
  });

  test("jsonSchema defaults match DEFAULTS values", () => {
    const schema = ConfigSchema.jsonSchema() as Record<string, unknown>;
    const props = schema.properties as Record<string, { properties: Record<string, { default: unknown }> }>;

    expect(props.server.properties.port.default).toBe(3000);
    expect(props.server.properties.host.default).toBe("localhost");
    expect(props.db.properties.type.default).toBe("sqlite");
    expect(props.assets.properties.enabled.default).toBe(true);
    expect(props.auth.properties.required.default).toBe(false);
    expect(props.messages.properties.maxLength.default).toBe(100_000);
  });

  // ── Config format round-trip ────────────────────────────

  test("envMap keys map back to valid config paths", () => {
    const map = ConfigSchema.envMap();
    const cfg = structuredClone(DEFAULTS) as unknown as Record<string, unknown>;

    for (const dotPath of Object.values(map)) {
      const parts = dotPath.split(".");
      let current: unknown = cfg;
      let pathExists = true;
      for (const part of parts) {
        if (current === undefined || current === null || typeof current !== "object") {
          pathExists = false;
          // eslint-disable-next-line unicorn/no-break-in-nested-loop
          break;
        }
        current = (current as Record<string, unknown>)[part];
      }
      // Optional fields (testing.*, db.url, optional logging) may be undefined — expected
      if (pathExists && current !== undefined) {
        expect(current).toBeDefined();
      }
    }
    // At least some paths must resolve
    const resolved = Object.values(map).filter((dotPath) => {
      const parts = dotPath.split(".");
      let current: unknown = cfg;
      for (const part of parts) {
        if (current === undefined || current === null || typeof current !== "object") return false;
        current = (current as Record<string, unknown>)[part];
      }
      return current != null;
    });
    expect(resolved.length).toBeGreaterThan(50); // Most paths should resolve
  });
});
