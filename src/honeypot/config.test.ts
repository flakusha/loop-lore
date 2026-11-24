// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { loadHoneypotConfig, parseHoneypotConfig, } from "./config";

const VALID = `
host = "127.0.0.1"
port = 8099
tarpitMs = 900
maxConcurrentTarpits = 0

[[deny]]
userAgent = "ExampleCrawler"

[[deny]]
ip = "203.0.113.10"
`;

describe("decoy config parsing", () => {
  test("accepts a bounded TOML config", () => {
    const config = parseHoneypotConfig(Bun.TOML.parse(VALID,),);
    expect(config.host,).toBe("127.0.0.1",);
    expect(config.port,).toBe(8099,);
    expect(config.tarpitMs,).toBe(500,);
    expect(config.maxConcurrentTarpits,).toBe(1,);
    expect(config.denyRules,).toEqual([
      { userAgent: "ExampleCrawler", },
      { ip: "203.0.113.10", },
    ],);
  });

  test("defaults to no deny rules when the table is empty", () => {
    expect(parseHoneypotConfig({},).denyRules,).toEqual([],);
  });

  test("rejects malformed rules and out-of-range values", () => {
    expect(() => parseHoneypotConfig({ port: 70_000, },)).toThrow(/port/,);
    expect(() => parseHoneypotConfig({ deny: [{},], },)).toThrow(/deny\[0\]/,);
    expect(() => parseHoneypotConfig({ deny: [{ ip: 7, },], },)).toThrow(/ip/,);
    expect(() => parseHoneypotConfig("nope",)).toThrow(/table/,);
  });
});

describe("loadHoneypotConfig", () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "ll-honeypot-config-",),);
  },);

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true, },);
  },);

  test("loads a TOML file from disk and applies the same bounds", async () => {
    const path = join(dir, "valid.toml",);
    writeFileSync(path, VALID, "utf8",);

    const config = await loadHoneypotConfig(path,);
    expect(config.host,).toBe("127.0.0.1",);
    expect(config.port,).toBe(8099,);
    expect(config.tarpitMs,).toBe(500,);
    expect(config.maxConcurrentTarpits,).toBe(1,);
    expect(config.denyRules,).toEqual([
      { userAgent: "ExampleCrawler", },
      { ip: "203.0.113.10", },
    ],);
  });

  test("rejects an out-of-range port read from disk", async () => {
    const path = join(dir, "bad-port.toml",);
    writeFileSync(path, "port = 70000\n", "utf8",);

    await expect(loadHoneypotConfig(path,),).rejects.toThrow(/port/,);
  });

  test("rejects a deny rule with neither ip nor userAgent", async () => {
    const path = join(dir, "bad-deny.toml",);
    writeFileSync(path, '[[deny]]\nkind = "anything"\n', "utf8",);

    await expect(loadHoneypotConfig(path,),).rejects.toThrow(/needs ip or userAgent/,);
  });
});
