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
import { describe, expect, test, } from "bun:test";
import type { Config, } from "../config/schema";
import { type SetupCheck, setupChecks, } from "../routes/setup/checks";
import { buildBootReadinessSummary, } from "./boot-readiness";

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
