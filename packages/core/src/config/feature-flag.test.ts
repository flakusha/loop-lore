// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// feature-flag tests: `--feature` parsing, fail-loud validation, last-wins,
// and env application with no process.env leak.

import { describe, expect, test, } from "bun:test";
import { applyFeatureFlag, FEATURE_FLAG, parseFeatureFlag, } from "./feature-flag";
import { FEATURE_PROFILES, } from "./schema/features";

const ENV_KEY = "FEATURES_PROFILE";

function saveEnv(): string | undefined {
  return process.env[ENV_KEY];
}

function restoreEnv(saved: string | undefined,): void {
  if (saved === undefined) { delete process.env[ENV_KEY]; }
  else { process.env[ENV_KEY] = saved; }
}

describe("parseFeatureFlag", () => {
  test("FEATURE_FLAG names the CLI flag the parser accepts", () => {
    expect(FEATURE_FLAG,).toBe("--feature",);
    expect(parseFeatureFlag([FEATURE_FLAG, "full",],),).toBe("full",);
  });
  test("absent flag returns undefined", () => {
    expect(parseFeatureFlag([],),).toBeUndefined();
    expect(parseFeatureFlag(["chat", "send", "--json",],),).toBeUndefined();
  });
  test("space and equals forms accept every profile", () => {
    for (const profile of FEATURE_PROFILES) {
      expect(parseFeatureFlag(["--feature", profile,],),).toBe(profile,);
      expect(parseFeatureFlag([`--feature=${profile}`,],),).toBe(profile,);
    }
  });
  test("flag found anywhere in argv (after subcommands too)", () => {
    expect(parseFeatureFlag(["chat", "send", "--feature", "local-only", "--json",],),).toBe("local-only",);
  });
  test("last occurrence wins across both forms", () => {
    expect(parseFeatureFlag(["--feature", "full", "--feature=local-only",],),).toBe("local-only",);
    expect(parseFeatureFlag(["--feature=full", "--feature", "relay-only",],),).toBe("relay-only",);
    expect(parseFeatureFlag(["--feature", "full", "--json", "--feature=business-only",],),).toBe(
      "business-only",
    );
  });
  test("argv is left intact", () => {
    const argv = ["chat", "--feature", "full",];
    parseFeatureFlag(argv,);
    expect(argv,).toEqual(["chat", "--feature", "full",],);
  });
  test("missing value throws", () => {
    expect(() => parseFeatureFlag(["--feature",],)).toThrow(/requires a value/,);
  });
  test("empty value throws", () => {
    expect(() => parseFeatureFlag(["--feature", "",],)).toThrow(/invalid --feature/,);
    expect(() => parseFeatureFlag(["--feature=",],)).toThrow(/invalid --feature/,);
  });
  test("flag-like value throws (forgotten value is loud)", () => {
    expect(() => parseFeatureFlag(["--feature", "--json",],)).toThrow(/invalid --feature/,);
  });
  test("unknown value throws with the allowed list", () => {
    expect(() => parseFeatureFlag(["--feature", "bogus",],)).toThrow(FEATURE_PROFILES.join(", ",),);
  });
});

describe("applyFeatureFlag", () => {
  test("present flag sets FEATURES_PROFILE", () => {
    const saved = saveEnv();
    try {
      delete process.env[ENV_KEY];
      applyFeatureFlag(["--feature=full",],);
      expect(process.env[ENV_KEY],).toBe("full",);
    } finally {
      restoreEnv(saved,);
    }
  });
  test("last flag occurrence wins in env", () => {
    const saved = saveEnv();
    try {
      delete process.env[ENV_KEY];
      applyFeatureFlag(["--feature", "full", "--feature=local-only",],);
      expect(process.env[ENV_KEY],).toBe("local-only",);
    } finally {
      restoreEnv(saved,);
    }
  });
  test("absent flag leaves env untouched", () => {
    const saved = saveEnv();
    try {
      process.env[ENV_KEY] = "keep-me";
      applyFeatureFlag(["chat",],);
      expect(process.env[ENV_KEY],).toBe("keep-me",);
      delete process.env[ENV_KEY];
      applyFeatureFlag(["chat",],);
      expect(process.env[ENV_KEY],).toBeUndefined();
    } finally {
      restoreEnv(saved,);
    }
  });
});
