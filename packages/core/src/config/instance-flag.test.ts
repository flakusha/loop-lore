// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// instance-flag tests: `--instance` parsing, fail-loud validation, and
// flag/env agreement on the resolved dir.

import { describe, expect, test, } from "bun:test";
import { applyInstanceFlag, parseInstanceFlag, } from "./instance-flag";
import { resolveDbPath, } from "./state-dir";

function saveEnv(): Map<string, string | undefined> {
  const saved = new Map<string, string | undefined>();
  for (
    const key of ["LOOP_LORE_INSTANCE", "LOOP_LORE_STATE_DIR", "XDG_STATE_HOME", "PORT", "LOOP_LORE_DB_PATH",] as const
  ) {
    saved.set(key, process.env[key],);
  }
  return saved;
}

function restoreEnv(saved: Map<string, string | undefined>,): void {
  for (const [key, value,] of saved) {
    if (value === undefined) { delete process.env[key]; }
    else { process.env[key] = value; }
  }
}

describe("parseInstanceFlag", () => {
  test("absent flag returns undefined (default behavior)", () => {
    expect(parseInstanceFlag([],),).toBeUndefined();
    expect(parseInstanceFlag(["chat", "send", "--json",],),).toBeUndefined();
  });
  test("space and equals forms return the name", () => {
    expect(parseInstanceFlag(["--instance", "foo",],),).toBe("foo",);
    expect(parseInstanceFlag(["--instance=foo",],),).toBe("foo",);
  });
  test("flag found anywhere in argv (after subcommands too)", () => {
    expect(parseInstanceFlag(["chat", "send", "--instance", "foo", "--json",],),).toBe("foo",);
  });
  test("missing value throws", () => {
    expect(() => parseInstanceFlag(["--instance",],)).toThrow(/requires a value/,);
  });
  test("empty value throws", () => {
    expect(() => parseInstanceFlag(["--instance", "",],)).toThrow(/invalid --instance/,);
    expect(() => parseInstanceFlag(["--instance=",],)).toThrow(/invalid --instance/,);
  });
  test("path escapes and separators throw (no silent remap)", () => {
    for (const bad of ["../", "..", "a/b", "a b",] as const) {
      expect(() => parseInstanceFlag(["--instance", bad,],)).toThrow(/invalid --instance/,);
    }
  });
  test("flag-like value throws (forgotten value is loud, not a weird slug)", () => {
    expect(() => parseInstanceFlag(["--instance", "--json",],)).toThrow(/invalid --instance/,);
  });
});

describe("applyInstanceFlag", () => {
  test("absent flag leaves env untouched", () => {
    const saved = saveEnv();
    try {
      process.env["LOOP_LORE_INSTANCE"] = "keep-me";
      applyInstanceFlag(["chat",],);
      expect(process.env["LOOP_LORE_INSTANCE"],).toBe("keep-me",);
    } finally {
      restoreEnv(saved,);
    }
  });
  test("flag wins over env and agrees on the resolved dir", () => {
    const saved = saveEnv();
    try {
      process.env["LOOP_LORE_STATE_DIR"] = "/tmp/flag-agree-state";
      delete process.env["LOOP_LORE_DB_PATH"];
      process.env["LOOP_LORE_INSTANCE"] = "from-env";
      applyInstanceFlag(["--instance", "from-flag",],);
      const viaFlag = resolveDbPath();
      process.env["LOOP_LORE_INSTANCE"] = "from-flag";
      expect(resolveDbPath(),).toBe(viaFlag,);
      expect(viaFlag,).toContain("/from-flag/",);
    } finally {
      restoreEnv(saved,);
    }
  });
});
