// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Pins one `E2E_SAFEGUARD=1` per e2e-reaching leg of the developer test scripts.
 *
 * Both e2e surfaces hit `/api/v1/*`, whose governance rate-limit guard
 * (`src/routes/v1/index.ts`) is enabled unless `E2E_SAFEGUARD=1`. The e2e
 * harness fires hundreds of requests per user, so the per-user window 429s
 * every flow without the opt-out.
 *
 * The shell rule that makes this a per-leg invariant rather than a per-script
 * one: `VAR=x cmd1 && cmd2` binds the assignment to `cmd1` ALONE — verified on
 * this repo's runner (`bun run` hands the script to `/bin/bash -c`, and Bun's
 * own shell behaves identically). A single chain-leading prefix therefore
 * guards only the first leg and leaves the rest running unexported, which is
 * exactly the inert-prefix shape this file exists to reject.
 */
import { describe, expect, test, } from "bun:test";
import { readFileSync, } from "node:fs";
import { resolve, } from "node:path";

const ROOT = resolve(import.meta.dir, "..",);
const scripts: Record<string, string> = JSON.parse(
  readFileSync(resolve(ROOT, "package.json",), "utf8",),
).scripts;

/**
 * A leg reaches the e2e suite when it runs tests with no `src/`-only path
 * filter (bare `bun test` discovers every `*.test.ts` under `tests/e2e/`) or
 * when it is one of the browser entry points.
 */
function reachesE2e(leg: string,): boolean {
  if (/\bbun run test:e2e\b/.test(leg,)) { return true; }
  if (/run-browser-tests\.ts/.test(leg,)) { return true; }
  const invocation = leg.match(/\bbun test\b(.*)$/,)?.[1]?.trim() ?? null;
  if (invocation === null) { return false; }
  return invocation === "" || invocation.includes("tests/e2e",);
}

describe("e2e safeguard wiring in package.json scripts", () => {
  test("every e2e-reaching leg of test:all carries its own guard", () => {
    const legs = (scripts["test:all"] ?? "")
      .split("&&",)
      .map((leg,) => leg.trim())
      .filter((leg,) => leg.length > 0);
    const e2e = legs.filter(reachesE2e,);
    expect(
      e2e.filter((leg,) => !leg.startsWith("E2E_SAFEGUARD=1 ",)),
      "each e2e-reaching leg needs its own prefix — a chain-leading one binds to the first leg only",
    ).toEqual([],);
    // `build:frontend` is the only non-e2e leg, so more than one e2e leg also
    // fails loudly if the chain collapses back to a single chain-wide prefix.
    expect(e2e.length,).toBeGreaterThan(1,);
  });

  test.each(["test:e2e", "test:e2e:browser", "test:e2e:smoke",],)(
    "%s exports the guard",
    (name,) => {
      expect(scripts[name],).toStartWith("E2E_SAFEGUARD=1 ",);
    },
  );

  test("the guard is still consulted by the v1 route surface", () => {
    const source = readFileSync(resolve(ROOT, "src/routes/v1/index.ts",), "utf8",);
    expect(source,).toContain('process.env.E2E_SAFEGUARD !== "1"',);
  });
});
