// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { checkReleaseGateWiring, readWorkflowFiles, } from "./release-gate-wiring";

const ROOT = import.meta.dir + "/../..";

/** A workflow that installs the browser before the step that needs it. */
const WIRED = [
  "      - name: Install Playwright browsers",
  "        run: bunx playwright install chromium",
  "",
  "      - name: Run local gate suite",
  "        run: bun run check:ci",
].join("\n",);

describe("checkReleaseGateWiring", () => {
  test("a workflow that installs the browser first passes", () => {
    expect(checkReleaseGateWiring([{ path: "ci.yml", text: WIRED, },],),).toEqual([],);
  });

  test("a workflow that never installs a browser is reported", () => {
    const errors = checkReleaseGateWiring([
      { path: "release.yml", text: "        run: bun run check:ci", },
    ],);
    expect(errors.length,).toBe(1,);
    expect(errors[0],).toContain("never installs a browser",);
  });

  test("a workflow that installs the browser too late is reported", () => {
    const errors = checkReleaseGateWiring([
      { path: "release.yml", text: "        run: bun run check:ci\n" + WIRED, },
    ],);
    expect(errors.length,).toBe(1,);
    expect(errors[0],).toContain("AFTER",);
  });

  test("a comment naming the command is not a step", () => {
    const errors = checkReleaseGateWiring([
      { path: "release.yml", text: "      # `bun run check:ci` runs the browser gate\n", },
    ],);
    expect(errors,).toEqual([],);
  });

  test("a workflow without a browser-backed step is ignored", () => {
    const errors = checkReleaseGateWiring([
      { path: "audit.yml", text: "        run: bun run lint:eslint", },
    ],);
    expect(errors,).toEqual([],);
  });

  test("the repo workflows install the browser before the browser-backed step", async () => {
    const workflows = await readWorkflowFiles(ROOT,);
    expect(workflows.length,).toBeGreaterThan(0,);
    expect(checkReleaseGateWiring(workflows,),).toEqual([],);
  });
});
