// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Builder chain-run routes — start an async run, poll its status:
 *
 *   POST /api/v1/comfyui-builder/runs        — 201 { jobId }
 *   GET  /api/v1/comfyui-builder/runs/:jobId — job status (owner only)
 *
 * Execution delegates each step to `handleRun` in the background; the step
 * runner is injectable so contract tests can stub the provider.
 */
import { Type, } from "@sinclair/typebox";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import {
  type ChainRunJob,
  getChain,
  getRunJob,
  startChainRun,
  type StepRunner,
} from "../../generation/builder";
import { notFound, } from "../../validation/middleware";
import {
  ChainRunBody,
  type ChainRunBodyT,
  ErrorResponse,
  SuccessResponse,
} from "../../validation/schemas";
import { HttpStatus, jsonCreated, jsonError, jsonResponse, requireUserId, } from "../http-utils";

const JobParams = Type.Object({ jobId: Type.String(), },);

/** Route options. */
export interface BuilderRunRouteOpts {
  database: Kysely<DB>;
  /** Test seam — defaults to the `handleRun` delegate. */
  executeStep?: StepRunner;
}

/**
 * @param root0 - Handler options
 * @param root0.database - Kysely instance for chain reads
 * @param root0.executeStep - test seam; defaults to the `handleRun` delegate
 * @param prefix - Route prefix
 * @returns the Elysia plugin mounting the run routes
 */
export function builderRunRoutes(
  { database, executeStep, }: BuilderRunRouteOpts,
  prefix = "/api",
) {
  return new Elysia({ name: "comfyui-builder-run", },)
    .post(`${prefix}/comfyui-builder/runs`, async (ctx,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const body = ctx.body as ChainRunBodyT;
      const chain = await getChain(database, body.chainId, userId,);
      if (!chain) { return notFound("Chain not found",); }
      if (chain.steps.length === 0) {
        return jsonError({ message: "Chain has no steps", status: HttpStatus.BadRequest, },);
      }

      const auth = ctx as unknown as { userRole?: string | null };
      const job = startChainRun({
        ownerId: userId,
        chainId: chain.id,
        steps: chain.steps,
        auth: { database, userId, userRole: auth.userRole ?? null, },
        linkage: { chatId: body.chatId, messageId: body.messageId, },
        executeStep,
      },);

      return jsonCreated({ jobId: job.id, },);
    }, {
      body: ChainRunBody,
      response: { 201: SuccessResponse, 400: ErrorResponse, 401: ErrorResponse, 404: ErrorResponse, },
      detail: { summary: "Start a builder chain run", tags: ["ComfyUI Builder",], },
    },)
    .get(`${prefix}/comfyui-builder/runs/:jobId`, async (ctx,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const job = getRunJobForOwner(ctx.params.jobId, userId,);
      if (!job) { return notFound("Run not found",); }
      return jsonResponse({ job, },);
    }, {
      params: JobParams,
      response: { 200: SuccessResponse, 401: ErrorResponse, 404: ErrorResponse, },
      detail: { summary: "Poll a builder chain run", tags: ["ComfyUI Builder",], },
    },);
}

/**
 * Owner-scoped job lookup — foreign or unknown ids read as not found.
 * @param jobId - run job id
 * @param userId - requesting owner id
 * @returns the job when it exists and belongs to `userId`; otherwise undefined.
 */
function getRunJobForOwner(jobId: string, userId: string,): ChainRunJob | undefined {
  const job = getRunJob(jobId,);
  return job && job.ownerId === userId ? job : undefined;
}
