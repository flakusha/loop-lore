// src/config/domain-configs.test.ts — Tests for domain-specific config file loading

import { beforeAll, describe, expect, test, } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, } from "node:fs";
import path from "node:path";
import { createLogger, } from "../logger";
import { loadConfig, } from "./load";

const TEST_DIR = path.join(import.meta.dir, "__test_domain_configs__",);

describe("Domain Config Loading", () => {
  beforeAll(() => {
    // loadConfig → template expansion calls getLogger(), which throws unless a
    // root logger exists. Other tests initialize it as a module side effect;
    // --isolate processes skip that, so init here explicitly.
    createLogger({ level: "error", },);
  });
  test("loads domain-specific config files from configs/", () => {
    // Create test configs directory
    mkdirSync(path.join(TEST_DIR, "configs",), { recursive: true, },);

    // Create domain config files
    writeFileSync(
      path.join(TEST_DIR, "configs", "config.server.toml",),
      '[server]\nport = 8080\nhost = "0.0.0.0"\n',
    );
    writeFileSync(
      path.join(TEST_DIR, "configs", "config.database.toml",),
      '[db]\ntype = "sqlite"\nsqliteFilename = "./test.db"\n',
    );

    const config = loadConfig(TEST_DIR,);

    expect(config.server.port,).toBe(8080,);
    expect(config.server.host,).toBe("0.0.0.0",);
    expect(config.db.type,).toBe("sqlite",);
    expect(config.db.sqliteFilename,).toBe("./test.db",);

    // Cleanup
    rmSync(TEST_DIR, { recursive: true, },);
  });

  test("domain configs override main config", () => {
    mkdirSync(path.join(TEST_DIR, "configs",), { recursive: true, },);

    // Create main config
    writeFileSync(
      path.join(TEST_DIR, "config.toml",),
      '[server]\nport = 7171\nhost = "localhost"\n',
    );

    // Create domain config that overrides main config
    writeFileSync(
      path.join(TEST_DIR, "configs", "config.server.toml",),
      "[server]\nport = 9090\n",
    );

    const config = loadConfig(TEST_DIR,);

    // Domain config should override main config
    expect(config.server.port,).toBe(9090,);
    // Main config value should be preserved where not overridden
    expect(config.server.host,).toBe("localhost",);

    // Cleanup
    rmSync(TEST_DIR, { recursive: true, },);
  });

  test("domain configs support YAML format", () => {
    mkdirSync(path.join(TEST_DIR, "configs",), { recursive: true, },);

    writeFileSync(
      path.join(TEST_DIR, "configs", "config.server.yaml",),
      'server:\n  port: 8080\n  host: "0.0.0.0"\n',
    );

    const config = loadConfig(TEST_DIR,);

    expect(config.server.port,).toBe(8080,);
    expect(config.server.host,).toBe("0.0.0.0",);

    // Cleanup
    rmSync(TEST_DIR, { recursive: true, },);
  });

  test("first found domain config wins per domain", () => {
    mkdirSync(path.join(TEST_DIR, "configs",), { recursive: true, },);

    // Create both YAML and TOML for same domain
    writeFileSync(
      path.join(TEST_DIR, "configs", "config.server.yaml",),
      "server:\n  port: 8080\n",
    );
    writeFileSync(
      path.join(TEST_DIR, "configs", "config.server.toml",),
      "[server]\nport = 9090\n",
    );

    const config = loadConfig(TEST_DIR,);

    // YAML should win (first in DOMAIN_CONFIG_EXTENSIONS)
    expect(config.server.port,).toBe(8080,);

    // Cleanup
    rmSync(TEST_DIR, { recursive: true, },);
  });

  test("validates domain config - invalid server port", () => {
    mkdirSync(path.join(TEST_DIR, "configs",), { recursive: true, },);

    writeFileSync(
      path.join(TEST_DIR, "configs", "config.server.toml",),
      "[server]\nport = 99999\n",
    );

    expect(() => loadConfig(TEST_DIR,)).toThrow("Invalid server.port",);

    // Cleanup
    rmSync(TEST_DIR, { recursive: true, },);
  });

  test("validates domain config - invalid db type", () => {
    mkdirSync(path.join(TEST_DIR, "configs",), { recursive: true, },);

    writeFileSync(
      path.join(TEST_DIR, "configs", "config.database.toml",),
      '[db]\ntype = "mysql"\n',
    );

    expect(() => loadConfig(TEST_DIR,)).toThrow("Invalid db.type",);

    // Cleanup
    rmSync(TEST_DIR, { recursive: true, },);
  });

  test("validates domain config - invalid logging level", () => {
    mkdirSync(path.join(TEST_DIR, "configs",), { recursive: true, },);

    writeFileSync(
      path.join(TEST_DIR, "configs", "config.logging.toml",),
      '[logging]\nlevel = "verbose"\n',
    );

    expect(() => loadConfig(TEST_DIR,)).toThrow("Invalid logging.level",);

    // Cleanup
    rmSync(TEST_DIR, { recursive: true, },);
  });
});
