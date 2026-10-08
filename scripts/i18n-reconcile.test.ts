// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * CLI surface of `bun run i18n:check` (scripts/i18n-reconcile.ts).
 *
 * Resource contract — why this suite is parallel-safe:
 * - DISK: nothing is written. `--fix` is deliberately NOT spawned; the suite
 *   runs the check-only and `--ci` paths, which read `src/public/locales/` and
 *   never write. A sibling process may mutate those files concurrently without
 *   this suite racing it, because it holds no write handle of its own.
 * - PROCESS: each case is a spawned child, so the script's module-level parser
 *   and top-level `main()` state are per-invocation.
 * - The locale argument is asserted on stdout, not on the exit code, because
 *   whether a given locale is complete is repo state this suite must not
 *   depend on (nor pin).
 * - No shared globals, no ordering dependence.
 */
import { describe, expect, test, } from "bun:test";
import path from "node:path";

const SCRIPT = path.join(import.meta.dir, "i18n-reconcile.ts",);

describe("i18n-reconcile CLI", () => {
  test("--help prints the brief and exits 0", () => {
    const proc = Bun.spawnSync(["bun", SCRIPT, "--help",],);
    expect(proc.exitCode,).toBe(0,);
    expect(proc.stdout.toString(),).toContain("Reconcile src/public/locales/",);
  });

  test("--locale scopes the report to exactly that locale", () => {
    const proc = Bun.spawnSync(["bun", SCRIPT, "--locale", "ja",],);
    const out = proc.stdout.toString();
    expect(out,).toContain("i18n Reconciliation Report",);
    expect(out,).toContain("\nja.json:",);
    // A second per-locale header would mean --locale was silently ignored and
    // every locale was reconciled — the regression this guards. `en.json` is
    // excluded from the loop (it is the source), so `ar` is the canary.
    expect(out,).not.toContain("\nar.json:",);
  });

  test("--ci without --fix runs check-only and exits 0 or 1, never crashing", () => {
    const proc = Bun.spawnSync(["bun", SCRIPT, "--ci",],);
    const out = proc.stdout.toString();
    expect(out,).toContain("i18n Reconciliation Report",);
    expect(out,).toContain("locales complete",);
    // --ci exits 1 exactly when discrepancies remain; whether they remain is
    // repo state this suite must not pin, so both clean codes are accepted.
    expect([0, 1,],).toContain(proc.exitCode,);
  });

  test("an unknown option is rejected with exit 1", () => {
    const proc = Bun.spawnSync(["bun", SCRIPT, "--no-such-flag",],);
    expect(proc.exitCode,).toBe(1,);
  });
});
