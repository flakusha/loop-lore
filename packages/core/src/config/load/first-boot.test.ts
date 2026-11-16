// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/load/first-boot.test.ts — Empty-env boot promotion.

import { createLogger, } from "@/logger";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import type { Config, } from "../schema";
import { createConfigSchema, } from "../schema-class";
import {
  ensureFirstBootPiiSecrets,
  ensureFirstBootPiiSecretsWithOutcome,
  FIRST_BOOT_FILE,
  FirstBootContentionError,
  generatePiiSecret,
  getLastFirstBootPromotion,
  hasAnyConfigFile,
  publishOrAdoptFirstBootSecrets,
  publishOrAdoptFirstBootSecretsWithOutcome,
  readWinnerFirstBootSecrets,
  renderFirstBootYaml,
  writeFirstBootFile,
} from "./first-boot";
import { deepMerge, } from "./parse";
import { MIN_PII_SECRET_LENGTH, validatePiiSafety, } from "./pii-safety";

beforeAll(() => {
  createLogger({ level: "error", },);
},);

const SECRET_ENV = [
  "NSFW_PII_SECRET",
  "NSFW_FLAG_REPORTER_HASH_SECRET",
  "NSFW_MODERATION_HMAC_SECRET",
  "TELEMETRY_PII_SECRET",
];

/** Empty env: no NODE_ENV (prod-like), no secrets. Returns a restore fn. */
function emptyEnv(): () => void {
  const saved = new Map<string, string | undefined>();
  for (const key of [...SECRET_ENV, "NODE_ENV",]) {
    saved.set(key, process.env[key],);
    delete process.env[key];
  }
  return () => {
    for (const [key, value,] of saved) {
      if (value === undefined) { delete process.env[key]; }
      else { process.env[key] = value; }
    }
  };
}

/** Set NODE_ENV for one test, restoring the prior value after — never delete: bun sets NODE_ENV=test for the test process and sibling files depend on it. */
function withNodeEnv(value: string,): () => void {
  const prior = process.env["NODE_ENV"];
  process.env["NODE_ENV"] = value;
  return () => {
    if (prior === undefined) { delete process.env["NODE_ENV"]; }
    else { process.env["NODE_ENV"] = prior; }
  };
}

function freshConfig(): Config {
  return structuredClone(createConfigSchema().defaults,) as Config;
}

function scratchDir(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "first-boot-",),);
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true, },), };
}

describe("generatePiiSecret", () => {
  test("meets the production minimum length", () => {
    expect(generatePiiSecret().length,).toBeGreaterThanOrEqual(MIN_PII_SECRET_LENGTH,);
  });

  test("is unique per call", () => {
    expect(generatePiiSecret(),).not.toBe(generatePiiSecret(),);
  });
});

describe("hasAnyConfigFile", () => {
  test("empty dir has no config", () => {
    const { dir, cleanup, } = scratchDir();
    try {
      expect(hasAnyConfigFile(dir,),).toBe(false,);
    } finally {
      cleanup();
    }
  });

  test("sees main, local, default, domain, and env files", () => {
    for (
      const name of ["config.yaml", "config.local.toml", "config.default.yml", "configs/config.nsfw.yaml", "env.yaml",]
    ) {
      const { dir, cleanup, } = scratchDir();
      try {
        const target = join(dir, name,);
        mkdirSync(join(dir, name.split("/",).slice(0, -1,).join("/",),), { recursive: true, },);
        writeFileSync(target, "{}",);
        expect(hasAnyConfigFile(dir,),).toBe(true,);
      } finally {
        cleanup();
      }
    }
  });
});

describe("renderFirstBootYaml", () => {
  test("omits ungenerated sections", () => {
    const yaml = renderFirstBootYaml({ telemetryPiiSecret: "x".repeat(32,), },);
    expect(yaml,).not.toContain("nsfw",);
    expect(yaml,).toContain("observability:",);
  });
});

describe("writeFirstBootFile", () => {
  test("writes chmod 0600 and refuses to overwrite (O_EXCL)", () => {
    const { dir, cleanup, } = scratchDir();
    const restore = emptyEnv();
    try {
      const secrets = { nsfwPiiSecret: generatePiiSecret(), };
      expect(writeFirstBootFile(dir, secrets,),).toBe("created",);
      expect(statSync(join(dir, FIRST_BOOT_FILE,),).mode & 0o777,).toBe(0o600,);
      expect(writeFirstBootFile(dir, secrets,),).toBe("existed",);
      expect(readFileSync(join(dir, FIRST_BOOT_FILE,), "utf8",),).toBe(renderFirstBootYaml(secrets,),);
    } finally {
      restore();
      cleanup();
    }
  });
});

describe("ensureFirstBootPiiSecrets", () => {
  test("empty env + empty dir: promotes secrets and validates", () => {
    const { dir, cleanup, } = scratchDir();
    const restore = emptyEnv();
    try {
      const promoted = ensureFirstBootPiiSecrets(dir, freshConfig(),);
      expect(() => validatePiiSafety(promoted,)).not.toThrow();
      expect(existsSync(join(dir, FIRST_BOOT_FILE,),),).toBe(true,);
      expect(promoted.nsfw.piiSecret!.length,).toBeGreaterThanOrEqual(MIN_PII_SECRET_LENGTH,);
    } finally {
      restore();
      cleanup();
    }
  });

  test("re-run with the promoted file leaves it untouched (idempotent)", () => {
    const { dir, cleanup, } = scratchDir();
    const restore = emptyEnv();
    try {
      ensureFirstBootPiiSecrets(dir, freshConfig(),);
      const before = readFileSync(join(dir, FIRST_BOOT_FILE,), "utf8",);
      // A real second boot merges the promoted file before promotion runs.
      const loaded = deepMerge(freshConfig(), Bun.YAML.parse(before,) as Record<string, unknown>,);
      const second = ensureFirstBootPiiSecrets(dir, loaded,);
      expect(second,).toBe(loaded,);
      expect(readFileSync(join(dir, FIRST_BOOT_FILE,), "utf8",),).toBe(before,);
      expect(() => validatePiiSafety(second,)).not.toThrow();
    } finally {
      restore();
      cleanup();
    }
  });

  test("pre-existing config file: untouched, validation still throws", () => {
    const { dir, cleanup, } = scratchDir();
    const restore = emptyEnv();
    try {
      writeFileSync(join(dir, "config.yaml",), "server:\n  port: 3000\n",);
      const config = freshConfig();
      expect(ensureFirstBootPiiSecrets(dir, config,),).toBe(config,);
      expect(existsSync(join(dir, FIRST_BOOT_FILE,),),).toBe(false,);
      expect(() => validatePiiSafety(config,)).toThrow(/NSFW_PII_SECRET/,);
    } finally {
      restore();
      cleanup();
    }
  });

  test("dev env: no file, config untouched", () => {
    const { dir, cleanup, } = scratchDir();
    const restoreNodeEnv = withNodeEnv("test",);
    try {
      const config = freshConfig();
      expect(ensureFirstBootPiiSecrets(dir, config,),).toBe(config,);
      expect(existsSync(join(dir, FIRST_BOOT_FILE,),),).toBe(false,);
    } finally {
      restoreNodeEnv();
      cleanup();
    }
  });

  test("secrets from env: no file", () => {
    const { dir, cleanup, } = scratchDir();
    const restore = emptyEnv();
    const long = "e".repeat(MIN_PII_SECRET_LENGTH,);
    process.env["NSFW_PII_SECRET"] = long;
    process.env["NSFW_FLAG_REPORTER_HASH_SECRET"] = long;
    process.env["TELEMETRY_PII_SECRET"] = long;
    try {
      const config = freshConfig();
      expect(ensureFirstBootPiiSecrets(dir, config,),).toBe(config,);
      expect(existsSync(join(dir, FIRST_BOOT_FILE,),),).toBe(false,);
    } finally {
      restore();
      cleanup();
    }
  });

  test("partial env: generates only the missing secrets", () => {
    const { dir, cleanup, } = scratchDir();
    const restore = emptyEnv();
    const long = "e".repeat(MIN_PII_SECRET_LENGTH,);
    process.env["NSFW_PII_SECRET"] = long;
    process.env["NSFW_FLAG_REPORTER_HASH_SECRET"] = long;
    try {
      const promoted = ensureFirstBootPiiSecrets(dir, freshConfig(),);
      expect(() => validatePiiSafety(promoted,)).not.toThrow();
      const file = readFileSync(join(dir, FIRST_BOOT_FILE,), "utf8",);
      expect(file,).not.toContain("nsfw:",);
      expect(file,).toContain("observability:",);
    } finally {
      restore();
      cleanup();
    }
  });

  test("short operator secret is never overwritten", () => {
    const { dir, cleanup, } = scratchDir();
    const restore = emptyEnv();
    try {
      writeFileSync(join(dir, "config.yaml",), "nsfw:\n  piiSecret: tiny\n",);
      const config = freshConfig();
      config.nsfw.piiSecret = "tiny";
      const out = ensureFirstBootPiiSecrets(dir, config,);
      expect(out.nsfw.piiSecret,).toBe("tiny",);
      expect(existsSync(join(dir, FIRST_BOOT_FILE,),),).toBe(false,);
    } finally {
      restore();
      cleanup();
    }
  });
});

describe("ensureFirstBootPiiSecretsWithOutcome (S4 promotion outcome)", () => {
  test("fresh boot reports created and records it", () => {
    const { dir, cleanup, } = scratchDir();
    const restore = emptyEnv();
    try {
      const { config, promotion, } = ensureFirstBootPiiSecretsWithOutcome(dir, freshConfig(),);
      expect(promotion,).toBe("created",);
      expect(getLastFirstBootPromotion(),).toBe("created",);
      expect(existsSync(join(dir, FIRST_BOOT_FILE,),),).toBe(true,);
      expect(() => validatePiiSafety(config,)).not.toThrow();
    } finally {
      restore();
      cleanup();
    }
  });

  test("dev env reports skipped-dev without touching disk", () => {
    const { dir, cleanup, } = scratchDir();
    const restoreNodeEnv = withNodeEnv("test",);
    try {
      const config = freshConfig();
      const { promotion, } = ensureFirstBootPiiSecretsWithOutcome(dir, config,);
      expect(promotion,).toBe("skipped-dev",);
      expect(getLastFirstBootPromotion(),).toBe("skipped-dev",);
      expect(existsSync(join(dir, FIRST_BOOT_FILE,),),).toBe(false,);
    } finally {
      restoreNodeEnv();
      cleanup();
    }
  });

  test("operator config file with missing secrets reports skipped-operator-config", () => {
    const { dir, cleanup, } = scratchDir();
    const restore = emptyEnv();
    try {
      writeFileSync(join(dir, "config.yaml",), "server:\n  port: 3000\n",);
      const config = freshConfig();
      const { promotion, } = ensureFirstBootPiiSecretsWithOutcome(dir, config,);
      expect(promotion,).toBe("skipped-operator-config",);
      expect(getLastFirstBootPromotion(),).toBe("skipped-operator-config",);
      expect(existsSync(join(dir, FIRST_BOOT_FILE,),),).toBe(false,);
      expect(() => validatePiiSafety(config,)).toThrow(/NSFW_PII_SECRET/,);
    } finally {
      restore();
      cleanup();
    }
  });

  test("fully env-provided secrets report skipped-operator-config", () => {
    const { dir, cleanup, } = scratchDir();
    const restore = emptyEnv();
    const long = "e".repeat(MIN_PII_SECRET_LENGTH,);
    process.env["NSFW_PII_SECRET"] = long;
    process.env["NSFW_FLAG_REPORTER_HASH_SECRET"] = long;
    process.env["TELEMETRY_PII_SECRET"] = long;
    try {
      const { promotion, } = ensureFirstBootPiiSecretsWithOutcome(dir, freshConfig(),);
      expect(promotion,).toBe("skipped-operator-config",);
      expect(getLastFirstBootPromotion(),).toBe("skipped-operator-config",);
      expect(existsSync(join(dir, FIRST_BOOT_FILE,),),).toBe(false,);
    } finally {
      restore();
      cleanup();
    }
  });

  test("restart with the promoted file reports existed-restart", () => {
    const { dir, cleanup, } = scratchDir();
    const restore = emptyEnv();
    try {
      ensureFirstBootPiiSecrets(dir, freshConfig(),);
      const before = readFileSync(join(dir, FIRST_BOOT_FILE,), "utf8",);
      // A real second boot merges the promoted file before promotion runs.
      const loaded = deepMerge(freshConfig(), Bun.YAML.parse(before,) as Record<string, unknown>,);
      const second = ensureFirstBootPiiSecretsWithOutcome(dir, loaded,);
      expect(second.promotion,).toBe("existed-restart",);
      expect(getLastFirstBootPromotion(),).toBe("existed-restart",);
      expect(second.config,).toBe(loaded,);
      expect(readFileSync(join(dir, FIRST_BOOT_FILE,), "utf8",),).toBe(before,);
    } finally {
      restore();
      cleanup();
    }
  });

  test("concurrent loser reports existed-adopted with the winner's secrets", () => {
    const { dir, cleanup, } = scratchDir();
    const restore = emptyEnv();
    try {
      const winnerSecrets = {
        nsfwPiiSecret: generatePiiSecret(),
        reporterHashSecret: generatePiiSecret(),
        telemetryPiiSecret: generatePiiSecret(),
      };
      writeFileSync(join(dir, FIRST_BOOT_FILE,), renderFirstBootYaml(winnerSecrets,), { mode: 0o600, },);
      const loserGenerated = {
        nsfwPiiSecret: "L".repeat(64,),
        reporterHashSecret: "M".repeat(64,),
        telemetryPiiSecret: "N".repeat(64,),
      };
      const { config, promotion, } = publishOrAdoptFirstBootSecretsWithOutcome(
        dir,
        freshConfig(),
        loserGenerated,
      );
      expect(promotion,).toBe("existed-adopted",);
      expect(config.nsfw.piiSecret,).toBe(winnerSecrets.nsfwPiiSecret,);
      expect(config.nsfw.reporterHashSecret,).toBe(winnerSecrets.reporterHashSecret,);
      expect(config.observability?.telemetry?.piiSecret,).toBe(winnerSecrets.telemetryPiiSecret,);
      expect(JSON.stringify(config,),).not.toContain("L".repeat(64,),);
      expect(() => validatePiiSafety(config,)).not.toThrow();
    } finally {
      restore();
      cleanup();
    }
  });

  test("the original entry point records the same outcome", () => {
    const { dir, cleanup, } = scratchDir();
    const restoreNodeEnv = withNodeEnv("test",);
    try {
      const config = freshConfig();
      expect(ensureFirstBootPiiSecrets(dir, config,),).toBe(config,);
      expect(getLastFirstBootPromotion(),).toBe("skipped-dev",);
    } finally {
      restoreNodeEnv();
      cleanup();
    }
  });
});

describe("publishOrAdoptFirstBootSecrets (concurrent loser)", () => {
  test("second boot adopts the winner's secrets; loser values nowhere", () => {
    const { dir, cleanup, } = scratchDir();
    const restore = emptyEnv();
    try {
      ensureFirstBootPiiSecrets(dir, freshConfig(),);
      const winnerFile = readFileSync(join(dir, FIRST_BOOT_FILE,), "utf8",);
      const winner = Bun.YAML.parse(winnerFile,) as {
        nsfw: { piiSecret: string; reporterHashSecret: string };
        observability: { telemetry: { piiSecret: string } };
      };
      // The loser generated its own values before losing the claim.
      const loserGenerated = {
        nsfwPiiSecret: "L".repeat(64,),
        reporterHashSecret: "M".repeat(64,),
        telemetryPiiSecret: "N".repeat(64,),
      };
      const adopted = publishOrAdoptFirstBootSecrets(dir, freshConfig(), loserGenerated,);
      expect(adopted.nsfw.piiSecret,).toBe(winner.nsfw.piiSecret,);
      expect(adopted.nsfw.reporterHashSecret,).toBe(winner.nsfw.reporterHashSecret,);
      expect(adopted.observability?.telemetry?.piiSecret,).toBe(winner.observability.telemetry.piiSecret,);
      const flat = JSON.stringify(adopted,);
      expect(flat,).not.toContain(loserGenerated.nsfwPiiSecret,);
      expect(flat,).not.toContain(loserGenerated.reporterHashSecret,);
      expect(flat,).not.toContain(loserGenerated.telemetryPiiSecret,);
      expect(readFileSync(join(dir, FIRST_BOOT_FILE,), "utf8",),).toBe(winnerFile,);
      expect(() => validatePiiSafety(adopted,)).not.toThrow();
    } finally {
      restore();
      cleanup();
    }
  });

  test("torn-file retry: slow writer still adopted", async () => {
    const { dir, cleanup, } = scratchDir();
    const restore = emptyEnv();
    const target = join(dir, FIRST_BOOT_FILE,);
    try {
      const winnerSecrets = {
        nsfwPiiSecret: generatePiiSecret(),
        reporterHashSecret: generatePiiSecret(),
        telemetryPiiSecret: generatePiiSecret(),
      };
      writeFileSync(target, 'nsfw:\n  piiSecret: "partial', { mode: 0o600, },);
      chmodSync(target, 0o600,);
      // Slow winner: lands the complete file while the loser is retrying.
      const writer = Bun.spawn([
        "bun",
        "-e",
        `await Bun.sleep(250); await Bun.write(${JSON.stringify(target,)}, ${
          JSON.stringify(renderFirstBootYaml(winnerSecrets,),)
        })`,
      ], {
        stdout: "ignore",
        stderr: "ignore",
      },);
      const adopted = publishOrAdoptFirstBootSecrets(dir, freshConfig(), {
        nsfwPiiSecret: "L".repeat(64,),
        reporterHashSecret: "M".repeat(64,),
        telemetryPiiSecret: "N".repeat(64,),
      },);
      await writer.exited;
      expect(adopted.nsfw.piiSecret,).toBe(winnerSecrets.nsfwPiiSecret,);
      expect(adopted.nsfw.reporterHashSecret,).toBe(winnerSecrets.reporterHashSecret,);
      expect(adopted.observability?.telemetry?.piiSecret,).toBe(winnerSecrets.telemetryPiiSecret,);
      expect(() => validatePiiSafety(adopted,)).not.toThrow();
    } finally {
      restore();
      cleanup();
    }
  });

  test("budget exhaustion throws FirstBootContentionError naming the file", () => {
    const { dir, cleanup, } = scratchDir();
    const restore = emptyEnv();
    try {
      const target = join(dir, FIRST_BOOT_FILE,);
      writeFileSync(target, 'nsfw:\n  piiSecret: "never-closes', { mode: 0o600, },);
      chmodSync(target, 0o600,);
      let thrown: unknown;
      try {
        readWinnerFirstBootSecrets(dir, 3, 5,);
      } catch (error) {
        thrown = error;
      }
      expect(thrown,).toBeInstanceOf(FirstBootContentionError,);
      expect((thrown as Error).message,).toContain(FIRST_BOOT_FILE,);
      expect((thrown as Error).message,).toContain("3x5ms",);
    } finally {
      restore();
      cleanup();
    }
  });

  test("symlink-planted target refused on publish and read", () => {
    const { dir, cleanup, } = scratchDir();
    const restore = emptyEnv();
    try {
      writeFileSync(join(dir, "real.yaml",), "nsfw:\n  piiSecret: planted\n",);
      symlinkSync(join(dir, "real.yaml",), join(dir, FIRST_BOOT_FILE,),);
      expect(() => writeFirstBootFile(dir, { nsfwPiiSecret: generatePiiSecret(), },)).toThrow(/symlink/,);
      expect(() => readWinnerFirstBootSecrets(dir, 2, 5,)).toThrow(/symlink/,);
      expect(() => publishOrAdoptFirstBootSecrets(dir, freshConfig(), { nsfwPiiSecret: "L".repeat(64,), },)).toThrow(
        /symlink/,
      );
    } finally {
      restore();
      cleanup();
    }
  });

  test("group-readable secret file refused", () => {
    const { dir, cleanup, } = scratchDir();
    const restore = emptyEnv();
    try {
      const target = join(dir, FIRST_BOOT_FILE,);
      writeFileSync(target, renderFirstBootYaml({ nsfwPiiSecret: generatePiiSecret(), },),);
      chmodSync(target, 0o644,);
      expect(() => readWinnerFirstBootSecrets(dir, 2, 5,)).toThrow(/group\/other/,);
    } finally {
      restore();
      cleanup();
    }
  });
});

afterAll(() => {
  delete process.env["NODE_ENV"];
},);
