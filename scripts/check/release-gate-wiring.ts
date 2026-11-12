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
/**
 * A step that drives a real browser and therefore needs one installed: the
 * gate suite (which contains the browser gate), the local `ci` chain (which
 * ends in the browser suite), and the browser suites themselves.
 */
const BROWSER_NEEDING_STEP = /^\s*run:.*bun run (check:ci|ci|test:all|test:e2e:browser|test:e2e:smoke)\b/;
/** A workflow job key, at the two-space indent GitHub Actions uses. */
const JOB_KEY = /^ {2}[A-Za-z0-9_-]+:\s*$/;

interface WorkflowJob {
  /** Job name, as written in the workflow. */
  readonly name: string;
  /** The job's lines. */
  readonly lines: string[];
}

/**
 * Split a workflow into its jobs. Text outside a job (the `on:`/`env:`
 * blocks) carries no steps and is dropped.
 * @param text - Workflow file contents.
 * @returns The jobs, in file order.
 */
function splitJobs(text: string,): WorkflowJob[] {
  const jobs: WorkflowJob[] = [];
  let current: WorkflowJob | undefined;
  for (const line of text.split("\n",)) {
    if (JOB_KEY.test(line,)) {
      current = { name: line.trim().replace(/:$/, "",), lines: [], };
      jobs.push(current,);
      continue;
    }
    current?.lines.push(line,);
  }
  return jobs;
}

/**
 * Check that every workflow job installs a browser before its browser-backed
 * step.
 * @param workflows - Workflow files to inspect.
 * @returns One message per violation; empty when the wiring is sound.
 */
export function checkReleaseGateWiring(workflows: readonly WorkflowFile[],): string[] {
  const errors: string[] = [];
  for (const workflow of workflows) {
    for (const job of splitJobs(workflow.text,)) {
      const lines = job.lines;
      const needsAt = lines.findIndex((line,) => BROWSER_NEEDING_STEP.test(line,));
      if (needsAt === -1) { continue; }
      const installAt = lines.findIndex((line,) => BROWSER_STEP.test(line,));
      if (installAt === -1) {
        errors.push(
          `${workflow.path} [${job.name}]: runs a browser-backed step but never installs a browser - the browser gate cannot pass`,
        );
      } else if (installAt > needsAt) {
        errors.push(
          `${workflow.path} [${job.name}]: installs the browser AFTER the browser-backed step - that step would run without one`,
        );
      }
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
