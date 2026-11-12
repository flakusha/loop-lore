// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { checkReleaseGateWiring, readWorkflowFiles, } from "./release-gate-wiring";

const ROOT = import.meta.dir + "/../..";

/** A workflow with the given job blocks. */
function workflow(...blocks: string[]): string {
  return ["jobs:", ...blocks,].join("\n",);
}

/** One workflow job: the job key and its steps. */
function job(name: string, steps: string[],): string {
  return [`  ${name}:`, "    steps:", ...steps,].join("\n",);
}

/** One workflow step, as the two lines GitHub Actions writes it. */
function step(name: string, run: string,): string[] {
  return [`      - name: ${name}`, `        run: ${run}`,];
}

/** A job that installs the browser before the step that needs it. */
const WIRED = workflow(
  job("gates", [
    ...step("Install Playwright browsers", "bunx playwright install chromium",),
    "",
    ...step("Run local gate suite", "bun run check:ci",),
  ],),
);

/** A job that runs a browser-backed step with no browser installed. */
const BARE = workflow(job("verify", step("Run quality checks", "bun run check:ci",),),);

/**
 * Resource contract: every case is PURE over strings - no temp directory,
 * no port, no database, no shared mutable state. Each case owns only its own
 * workflow literal, so the cases are order-independent and safe to run in
 * parallel; the last case only READS the repo's workflow files.
 */
describe("checkReleaseGateWiring", () => {
  test("a workflow that installs the browser first passes", () => {
    expect(checkReleaseGateWiring([{ path: "ci.yml", text: WIRED, },],),).toEqual([],);
  });

  test("a job that never installs a browser is reported", () => {
    const errors = checkReleaseGateWiring([
      { path: "release.yml", text: BARE, },
    ],);
    expect(errors.length,).toBe(1,);
    expect(errors[0],).toContain("never installs a browser",);
  });

  test("a job that installs the browser too late is reported", () => {
    const text = workflow(
      job("verify", [
        ...step("Run quality checks", "bun run check:ci",),
        ...step("Install Playwright browsers", "bunx playwright install chromium",),
      ],),
    );
    const errors = checkReleaseGateWiring([
      { path: "release.yml", text, },
    ],);
    expect(errors.length,).toBe(1,);
    expect(errors[0],).toContain("AFTER",);
  });

  test("a comment naming the command is not a step", () => {
    const errors = checkReleaseGateWiring([
      { path: "release.yml", text: workflow(job("verify", ["      # `bun run check:ci` runs the browser gate",],),), },
    ],);
    expect(errors,).toEqual([],);
  });

  test("a job without a browser-backed step is ignored", () => {
    const errors = checkReleaseGateWiring([
      { path: "audit.yml", text: workflow(job("audit", step("Lint", "bun run lint:eslint",),),), },
    ],);
    expect(errors,).toEqual([],);
  });

  test("an install in another job does not cover the job that runs the gate", () => {
    const text = workflow(
      job("provision", step("Install Playwright browsers", "bunx playwright install chromium",),),
      job("verify", step("Run quality checks", "bun run check:ci",),),
    );
    const errors = checkReleaseGateWiring([
      { path: "release.yml", text, },
    ],);
    expect(errors.length,).toBe(1,);
    expect(errors[0],).toContain("verify",);
  });

  test("the local ci chain counts as browser-backed", () => {
    const errors = checkReleaseGateWiring([
      { path: "ci.yml", text: workflow(job("gates", step("CI", "bun run ci",),),), },
    ],);
    expect(errors.length,).toBe(1,);
  });

  test("the browser E2E suite counts as browser-backed", () => {
    const errors = checkReleaseGateWiring([
      {
        path: "ci.yml",
        text: workflow(job("test-browser", step("Browser E2E Tests", "bun run test:e2e:browser",),),),
      },
    ],);
    expect(errors.length,).toBe(1,);
  });

  test("the repo workflows install the browser before the browser-backed step", async () => {
    const workflows = await readWorkflowFiles(ROOT,);
    expect(workflows.length,).toBeGreaterThan(0,);
    expect(checkReleaseGateWiring(workflows,),).toEqual([],);
  });
});
