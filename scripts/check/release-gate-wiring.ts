// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Release-path wiring: the gate suite contains the browser gate
 * (`e2e - browser (baseline)`), so every workflow that runs a browser-backed
 * step must install a Chromium FIRST. Without the browser the gate fails with
 * a missing-browser error and the release path can never go green - and the
 * failure only surfaces in CI, minutes into a release run.
 *
 * Pure over file contents: the loader reads the workflows, the check decides.
 */

import { Glob, } from "bun";

export interface WorkflowFile {
  /** Repo-relative path, quoted in the failure message. */
  readonly path: string;
  /** Raw file contents. */
  readonly text: string;
}

/** The step that provisions the browser the browser gate drives. */
const BROWSER_STEP = /^\s*run:.*playwright install/;
/** A step that drives a real browser and therefore needs one installed. */
const BROWSER_NEEDING_STEP = /^\s*run:.*(bun run check:ci|bun run test:e2e:browser)/;

/**
 * Check that every workflow installs a browser before a browser-backed step.
 * @param workflows - Workflow files to inspect.
 * @returns One message per violation; empty when the wiring is sound.
 */
export function checkReleaseGateWiring(workflows: readonly WorkflowFile[],): string[] {
  const errors: string[] = [];
  for (const workflow of workflows) {
    const lines = workflow.text.split("\n",);
    const needsAt = lines.findIndex((line,) => BROWSER_NEEDING_STEP.test(line,));
    if (needsAt === -1) { continue; }
    const installAt = lines.findIndex((line,) => BROWSER_STEP.test(line,));
    if (installAt === -1) {
      errors.push(
        `${workflow.path}: runs a browser-backed step but never installs a browser - the browser gate cannot pass`,
      );
    } else if (installAt > needsAt) {
      errors.push(
        `${workflow.path}: installs the browser AFTER the browser-backed step - that step would run without one`,
      );
    }
  }
  return errors;
}

/**
 * Read every workflow file under `.github/workflows`.
 * @param root - Repo root.
 * @returns The workflow files, path-sorted for stable output.
 */
export async function readWorkflowFiles(root: string,): Promise<WorkflowFile[]> {
  const files: WorkflowFile[] = [];
  for await (const file of new Glob(".github/workflows/*.y*ml",).scan({ cwd: root, },)) {
    files.push({ path: file, text: await Bun.file(root + "/" + file,).text(), },);
  }
  return files.sort((a, b,) => a.path.localeCompare(b.path,));
}
