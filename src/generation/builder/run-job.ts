// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chain run executor — runs a chain's steps sequentially as one background
 * job and delegates each step to `handleRun` (image-edit route handler), so
 * template lookup, authz linkage checks, required-param checks, and provider
 * dispatch stay in exactly one place.
 *
 * The step runner is injectable: tests stub it without a ComfyUI server.
 */
import { handleRun, } from "../../image-edit/routes";
import type { HandleRunAuth, } from "../../image-edit/run-authz";
import type { ImageEditRequest, } from "../../image-edit/types";
import { jsonStringifyOr, } from "../../utils/safe-json";
import type { ChainStep, } from "./chain-types";
import { type ChainRunJob, createRunJob, } from "./run-job-store";

/** Per-run chat/message linkage, validated by `handleRun`'s gate. */
export interface ChainRunLinkage {
  chatId?: string;
  messageId?: string;
}

/** Executes one step; returns the delegate's HTTP response. */
export type StepRunner = (body: ImageEditRequest, auth: HandleRunAuth,) => Promise<Response>;

/** Options for one chain run. */
export interface StartChainRunOpts {
  ownerId: string;
  chainId: string;
  steps: ChainStep[];
  auth: HandleRunAuth;
  linkage?: ChainRunLinkage;
  /** Defaults to the `handleRun` delegate; tests inject a stub. */
  executeStep?: StepRunner;
}

/**
 * Default step runner — builds an in-process Request and delegates to
 * `handleRun`. The URL is a placeholder; only the body is read.
 * @param body - Image-edit request assembled from the chain step
 * @param auth - Captured request auth (database, userId, userRole)
 * @returns the handler's response
 */
export async function executeViaHandleRun(
  body: ImageEditRequest,
  auth: HandleRunAuth,
): Promise<Response> {
  return handleRun(
    new Request("http://comfyui-builder.internal/api/v1/image-edit/run", {
      method: "POST",
      headers: { "content-type": "application/json", },
      body: jsonStringifyOr(body,),
    },),
    auth,
  );
}

/**
 * Extract a human-readable failure message from a non-ok step response.
 * @param response - the step's non-ok HTTP response
 * @returns the body's error/message when readable, else the status-line fallback.
 */
async function stepErrorMessage(response: Response,): Promise<string> {
  const fallback = `step failed with status ${response.status}`;
  try {
    const body = await response.json() as { error?: unknown; message?: unknown };
    const message = body.message ?? body.error;
    if (typeof message === "string" && message.length > 0) { return message; }
  } catch {
    // Non-JSON error body — the status line is the best signal we have.
  }
  return fallback;
}

/**
 * Run every step in order; first failure fails the job.
 * @param job - job record mutated in place (status, counters, error)
 * @param opts - chain run options (steps, linkage, auth)
 * @param executeStep - per-step delegate
 * @returns promise resolving once the job reaches a terminal state.
 */
async function runSteps(
  job: ChainRunJob,
  opts: StartChainRunOpts,
  executeStep: StepRunner,
): Promise<void> {
  job.status = "running";
  for (const step of opts.steps) {
    const body: ImageEditRequest = {
      template_id: step.templateId,
      backend: "comfyui",
      params: step.params,
      chatId: opts.linkage?.chatId,
      messageId: opts.linkage?.messageId,
    };
    const response = await executeStep(body, opts.auth,);
    if (!response.ok) {
      job.status = "failed";
      job.error = await stepErrorMessage(response,);
      job.completedAt = new Date().toISOString();
      return;
    }
    job.results.push(await response.json(),);
    job.completedSteps += 1;
  }
  job.status = "completed";
  job.completedAt = new Date().toISOString();
}

/**
 * Start a chain run in the background.
 *
 * The returned job is the polling handle; the executor mutates it in place.
 * Any rejection inside the background execution marks the job failed — the
 * promise is never left dangling.
 * @param opts - Run identity, steps, captured auth, and optional runner
 * @returns the stored pending/running job
 */
export function startChainRun(opts: StartChainRunOpts,): ChainRunJob {
  const job = createRunJob({
    ownerId: opts.ownerId,
    chainId: opts.chainId,
    totalSteps: opts.steps.length,
  },);
  const executeStep = opts.executeStep ?? executeViaHandleRun;
  runSteps(job, opts, executeStep,).catch((error,) => {
    job.status = "failed";
    job.error = error instanceof Error ? error.message : String(error,);
    job.completedAt = new Date().toISOString();
  },);
  return job;
}
