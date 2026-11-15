// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the boot readiness summary line (TASK-boot-readiness-summary).
 *
 * The line carries check ids + ok/off booleans only — never env values,
 * secret values, provider error text, or paths — even when the underlying
 * hints do (hints name env vars and failing providers by design).
 *
 * Deterministic: no network, no ports, no sleeps.
 */
import { beforeAll, describe, expect, test, } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import {
  ensureFirstBootPiiSecrets,
  FIRST_BOOT_FILE,
  type FirstBootPromotion,
  getLastFirstBootPromotion,
  publishOrAdoptFirstBootSecretsWithOutcome,
  renderFirstBootYaml,
} from "../config/load/first-boot";
import { deepMerge, } from "../config/load/parse";
import type { Config, } from "../config/schema";
import { createConfigSchema, } from "../config/schema-class";
import { createLogger, } from "../logger";
import { type SetupCheck, setupChecks, } from "../routes/setup/checks";
import { buildBootReadinessSummary, } from "./boot-readiness";

beforeAll(() => {
  createLogger({ level: "error", },);
},);

const ALL_OK: SetupCheck[] = [
  { id: "env.pii", ok: true, },
  { id: "provider.health", ok: true, },
  { id: "smk", ok: true, },
  { id: "model.roles", ok: true, },
  { id: "native", ok: true, },
  { id: "tls", ok: true, },
];

describe("buildBootReadinessSummary", () => {
  test("all checks ok renders the ready line", () => {
    expect(buildBootReadinessSummary(ALL_OK,),).toBe("setup readiness: ready (all checks ok)",);
  });

  test("off checks render as ids in stable check order", () => {
    const line = buildBootReadinessSummary([
      { id: "env.pii", ok: true, },
      { id: "provider.health", ok: false, },
      { id: "smk", ok: true, },
      { id: "model.roles", ok: false, },
      { id: "native", ok: false, },
      { id: "tls", ok: true, },
    ],);

    expect(line,).toBe("setup readiness: degraded (off: provider.health, model.roles, native)",);
  });

  test("the line is exactly one line", () => {
    for (const checks of [ALL_OK, [{ id: "tls", ok: false, },], [],]) {
      expect(buildBootReadinessSummary(checks,),).not.toContain("\n",);
    }
  });

  test("hints carrying secrets, errors and paths never reach the line", () => {
    const sentinelSecret = "SENTINEL-SECRET-9f8b7a6c5d4e";
    const sentinelError = "SENTINEL-PROVIDER-ERROR-connection refused";
    const sentinelPath = "/sentinel/tls/SENTINEL-key.pem";
    const hinted: SetupCheck[] = [
      { id: "env.pii", ok: false, hint: `Set NSFW_PII_SECRET to ${sentinelSecret}`, },
      { id: "provider.health", ok: false, hint: `dead-provider: ${sentinelError}`, },
      { id: "smk", ok: true, },
      { id: "model.roles", ok: true, },
      { id: "native", ok: true, },
      { id: "tls", ok: false, hint: `missing ${sentinelPath}`, },
    ];

    const line = buildBootReadinessSummary(hinted,);
    expect(line,).toBe("setup readiness: degraded (off: env.pii, provider.health, tls)",);
    expect(line,).not.toContain(sentinelSecret,);
    expect(line,).not.toContain(sentinelError,);
    expect(line,).not.toContain(sentinelPath,);
    expect(line,).not.toContain("NSFW_PII_SECRET",);
  });

  test("a config carrying sentinel secrets yields a line without them", async () => {
    const sentinelSecret = "SENTINEL-SECRET-9f8b7a6c5d4e";
    const sentinelPath = "/sentinel/tls/SENTINEL-key.pem";
    const config = {
      server: { tls: { key: sentinelPath, cert: sentinelPath, }, },
      nsfw: { piiSecret: sentinelSecret, },
      observability: { telemetry: { piiSecret: sentinelSecret, }, },
    } as unknown as Config;

    const line = buildBootReadinessSummary(await setupChecks(config,),);
    expect(line,).not.toContain(sentinelSecret,);
    expect(line,).not.toContain(sentinelPath,);
    expect(line,).not.toContain("\n",);
  });
});

describe("promotion field", () => {
  const promotions: FirstBootPromotion[] = [
    "created",
    "existed-adopted",
    "existed-restart",
    "skipped-dev",
    "skipped-operator-config",
  ];

  test("every outcome renders on the ready line", () => {
    for (const promotion of promotions) {
      expect(buildBootReadinessSummary(ALL_OK, promotion,),).toBe(
        `setup readiness: ready (all checks ok; promotion=${promotion})`,
      );
    }
  });

  test("every outcome renders on the degraded line", () => {
    const off = [{ id: "tls", ok: false, },];
    for (const promotion of promotions) {
      expect(buildBootReadinessSummary(off, promotion,),).toBe(
        `setup readiness: degraded (off: tls; promotion=${promotion})`,
      );
    }
  });

  test("omitted promotion keeps today's exact lines", () => {
    expect(buildBootReadinessSummary(ALL_OK,),).toBe("setup readiness: ready (all checks ok)",);
    expect(buildBootReadinessSummary([{ id: "tls", ok: false, },],),).toBe(
      "setup readiness: degraded (off: tls)",
    );
  });

  test("promotion lines stay single-line", () => {
    for (const promotion of promotions) {
      expect(buildBootReadinessSummary(ALL_OK, promotion,),).not.toContain("\n",);
    }
  });
});

describe("promotion wiring (start.ts path: register into the line)", () => {
  const SECRET_ENV = [
    "NSFW_PII_SECRET",
    "NSFW_FLAG_REPORTER_HASH_SECRET",
    "NSFW_MODERATION_HMAC_SECRET",
    "TELEMETRY_PII_SECRET",
  ];

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

  function freshConfig(): Config {
    return structuredClone(createConfigSchema().defaults,) as Config;
  }

  function scratchDir(): { dir: string; cleanup: () => void } {
    const dir = mkdtempSync(join(tmpdir(), "s4-summary-",),);
    return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true, },), };
  }

  test("created boot surfaces promotion=created", () => {
    const { dir, cleanup, } = scratchDir();
    const restore = emptyEnv();
    try {
      ensureFirstBootPiiSecrets(dir, freshConfig(),);
      expect(buildBootReadinessSummary(ALL_OK, getLastFirstBootPromotion(),),).toBe(
        "setup readiness: ready (all checks ok; promotion=created)",
      );
    } finally {
      restore();
      cleanup();
    }
  });

  test("dev boot surfaces promotion=skipped-dev", () => {
    const { dir, cleanup, } = scratchDir();
    process.env["NODE_ENV"] = "test";
    try {
      ensureFirstBootPiiSecrets(dir, freshConfig(),);
      expect(buildBootReadinessSummary(ALL_OK, getLastFirstBootPromotion(),),).toBe(
        "setup readiness: ready (all checks ok; promotion=skipped-dev)",
      );
    } finally {
      delete process.env["NODE_ENV"];
      cleanup();
    }
  });

  test("operator-owned config surfaces promotion=skipped-operator-config", () => {
    const { dir, cleanup, } = scratchDir();
    const restore = emptyEnv();
    try {
      writeFileSync(join(dir, "config.yaml",), "server:\n  port: 3000\n",);
      ensureFirstBootPiiSecrets(dir, freshConfig(),);
      expect(buildBootReadinessSummary(ALL_OK, getLastFirstBootPromotion(),),).toBe(
        "setup readiness: ready (all checks ok; promotion=skipped-operator-config)",
      );
    } finally {
      restore();
      cleanup();
    }
  });

  test("restart surfaces promotion=existed-restart", () => {
    const { dir, cleanup, } = scratchDir();
    const restore = emptyEnv();
    try {
      ensureFirstBootPiiSecrets(dir, freshConfig(),);
      const before = readFileSync(join(dir, FIRST_BOOT_FILE,), "utf8",);
      const loaded = deepMerge(freshConfig(), Bun.YAML.parse(before,) as Record<string, unknown>,);
      ensureFirstBootPiiSecrets(dir, loaded,);
      expect(buildBootReadinessSummary(ALL_OK, getLastFirstBootPromotion(),),).toBe(
        "setup readiness: ready (all checks ok; promotion=existed-restart)",
      );
    } finally {
      restore();
      cleanup();
    }
  });

  test("concurrent loser surfaces promotion=existed-adopted", () => {
    const { dir, cleanup, } = scratchDir();
    const restore = emptyEnv();
    try {
      writeFileSync(
        join(dir, FIRST_BOOT_FILE,),
        renderFirstBootYaml({ nsfwPiiSecret: "W".repeat(48,), },),
        { mode: 0o600, },
      );

      const { config, promotion, } = publishOrAdoptFirstBootSecretsWithOutcome(dir, freshConfig(), {
        nsfwPiiSecret: "L".repeat(48,),
      },);

      expect(config.nsfw.piiSecret,).toBe("W".repeat(48,),);
      expect(buildBootReadinessSummary(ALL_OK, promotion,),).toBe(
        "setup readiness: ready (all checks ok; promotion=existed-adopted)",
      );
    } finally {
      restore();
      cleanup();
    }
  });
});
