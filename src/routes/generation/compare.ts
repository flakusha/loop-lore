// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Model comparison A/B route (FEAT-060).
 *
 *   POST /api/v1/generation/compare
 *     — body: { prompt, models: [{ provider, model, temperature?, topP?, maxTokens? }] }
 *     — runs each model call in parallel via Promise.allSettled so a single
 *       provider failure does not block sibling results.
 *     — returns { results: [{ model, response, latencyMs, tokenCount, cost, status, error? }] }
 *
 * Distinct from src/routes/model-comparisons.ts, which tracks user
 * preferences between two models for a single message. This endpoint
 * produces the side-by-side generation results; the tracker stores them.
 */
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { resolveProvider, } from "../../generation/providers/registry";
import { uid, } from "../../utils";
import { safeJsonStringify, } from "../../utils/safe-json";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { jsonResponse, requireUserId, } from "../http-utils";

interface HandleOpts {
  config: Config;
  database: Kysely<DB>;
}

/** Cost per 1K tokens (blended default; replaced by model_capabilities pricing when seeded). */
const COST_PER_1K_TOKENS = 0.002;

const ModelConfig = t.Object({
  provider: t.String(),
  model: t.String(),
  temperature: t.Optional(t.Number(),),
  topP: t.Optional(t.Number(),),
  maxTokens: t.Optional(t.Number(),),
},);

const CompareBody = t.Object({
  prompt: t.String({ minLength: 1, },),
  models: t.Array(ModelConfig, { minItems: 1, },),
},);

/**
 * @param root0
 * @param prefix
 */
export function generationCompareRoutes(
  { config, database, }: HandleOpts,
  prefix = "/api/v1",
): Elysia {
  return new Elysia({ name: "generation-compare", },)
    .post(`${prefix}/generation/compare`, async (ctx,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }

      const body = ctx.body as {
        prompt: string;
        models: Array<{ provider: string; model: string; temperature?: number; topP?: number; maxTokens?: number }>;
      };

      // Detect parameter-sweep: same provider+model across all entries
      // with only temperature / topP / maxTokens differing. The label is
      // surfaced in each result for the UI.
      const firstKey = `${body.models[0]!.provider}::${body.models[0]!.model}`;
      const isSweep = body.models.every(
        (m,) => `${m.provider}::${m.model}` === firstKey,
      );

      const results = await Promise.allSettled(
        body.models.map(async (m,) => runOne({ config, database, }, m, body.prompt, userId,)),
      );

      const out = results.map((r, i,) => {
        const model = body.models[i]!;
        if (r.status === "fulfilled") {
          const v = r.value;
          return {
            model: { provider: model.provider, name: model.model, },
            response: v.response,
            latencyMs: v.latencyMs,
            tokenCount: v.tokenCount,
            cost: v.cost,
            status: "success" as const,
            metadata: isSweep ? { kind: "sweep", } : { kind: "ab", },
          };
        }
        return {
          model: { provider: model.provider, name: model.model, },
          response: "",
          latencyMs: 0,
          tokenCount: 0,
          cost: 0,
          status: "error" as const,
          error: r.reason instanceof Error ? r.reason.message : String(r.reason,),
          metadata: isSweep ? { kind: "sweep", } : { kind: "ab", },
        };
      },);

      const id = uid();
      const createdAt = new Date().toISOString();
      const resultsJson = safeJsonStringify(out,);
      const metadataJson = safeJsonStringify({ sweep: isSweep, modelCount: body.models.length, },);
      await database.insertInto("model_comparison_runs",).values({
        id,
        user_id: userId,
        prompt: body.prompt,
        results: resultsJson.ok ? resultsJson.value : "[]",
        ratings: "{}",
        metadata: metadataJson.ok ? metadataJson.value : "{}",
        created_at: createdAt,
      },).execute();
      return jsonResponse({ id, createdAt, results: out, sweep: isSweep, },);
    }, {
      body: CompareBody,
      response: {
        200: SuccessResponse,
        400: ErrorResponse,
        401: ErrorResponse,
      },
      detail: {
        summary: "Run parallel model A/B generation",
        description:
          "Generate responses from one or more model configurations against the same prompt. Results are returned in input order; one failing provider does not block siblings.",
        tags: ["Generation", "Comparisons",],
      },
    },);
}

interface RunOneResult {
  response: string;
  latencyMs: number;
  tokenCount: number;
  cost: number;
}

/**
 * Resolve the provider and call its non-streaming `complete`. Captures
 * latency, token count, and a blended cost estimate.
 *
 * @param config
 * @param m
 * @param prompt
 * @param userId
 */
async function runOne(
  { config, database, }: { config: Config; database: Kysely<DB> },
  m: { provider: string; model: string; temperature?: number; topP?: number; maxTokens?: number },
  prompt: string,
  userId: string,
): Promise<RunOneResult> {
  const resolved = await resolveProvider({
    config,
    db: database,
    provider: m.provider,
    model: m.model,
    userId,
  },);

  const startedAt = Date.now();
  const response = await resolved.provider.complete({
    model: resolved.resolvedModel ?? m.model,
    messages: [{ role: "user", content: prompt, },],
    params: {
      temperature: m.temperature,
      topP: m.topP,
      maxTokens: m.maxTokens,
    },
  },);
  const latencyMs = Date.now() - startedAt;

  const tokenCount = response.usage.totalTokens;
  const cost = Math.round(tokenCount / 1000 * COST_PER_1K_TOKENS * 100,) / 100;

  return {
    response: response.content,
    latencyMs,
    tokenCount,
    cost,
  };
}
