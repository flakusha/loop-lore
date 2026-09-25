// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Comparison export route (FEAT-060).
 *
 *   GET /api/v1/comparisons/:id/export?format=json|markdown
 *     — Returns the comparison record stored in `model_comparisons` plus
 *       the user's reference/preference/confidence metadata, formatted as
 *       JSON or a markdown report.
 *
 * Reads the existing `model_comparisons` tracker table (see
 * src/routes/model-comparisons.ts) and `messages` for the prompt text.
 */
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { jsonParseOr, safeJsonStringify, } from "../utils/safe-json";
import { ErrorResponse, SuccessResponse, } from "../validation/schemas";
import { jsonError, jsonResponse, requireUserId, } from "./http-utils";

interface HandleOpts {
  database: Kysely<DB>;
}

/**
 * @param root0
 * @param root0.database
 * @param prefix
 */
export function comparisonsExportRoutes(
  { database, }: HandleOpts,
  prefix = "/api/v1",
): Elysia {
  return new Elysia({ name: "comparisons-export", },)
    .get(`${prefix}/comparisons/:id/export`, async (ctx,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }

      const { id, } = ctx.params as { id: string };
      const formatRaw = (ctx.query ?? {}) as { format?: string };
      const format = (formatRaw.format ?? "json").toLowerCase();

      const run = await database
        .selectFrom("model_comparison_runs",)
        .selectAll()
        .where("id", "=", id,)
        .where("user_id", "=", userId,)
        .executeTakeFirst();
      if (run) {
        const report = {
          id: run.id,
          prompt: run.prompt,
          results: jsonParseOr(run.results, [],),
          ratings: jsonParseOr(run.ratings, {},),
          metadata: jsonParseOr(run.metadata, {},),
          createdAt: run.created_at,
        };
        if (format === "markdown") {
          return new Response(renderRunMarkdown(report,), {
            status: 200,
            headers: { "content-type": "text/markdown; charset=utf-8", },
          },);
        }
        return jsonResponse(report,);
      }

      const row = await database
        .selectFrom("model_comparisons",)
        .selectAll()
        .where("id", "=", id,)
        .where("user_id", "=", userId,)
        .executeTakeFirst();

      if (!row) {
        return jsonError("Comparison not found", 404,);
      }

      const message = await database
        .selectFrom("messages",)
        .select(["id", "content", "role",],)
        .where("id", "=", row.message_id,)
        .executeTakeFirst();

      const prompt = message?.content ?? "";

      if (format === "markdown") {
        const md = renderMarkdown({
          comparisonId: row.id,
          prompt,
          referenceModel: row.reference_model,
          preference: row.preference,
          confidence: row.confidence,
          createdAt: row.created_at,
        },);
        return new Response(md, {
          status: 200,
          headers: {
            "content-type": "text/markdown; charset=utf-8",
            "content-disposition": `attachment; filename="comparison-${id}.md"`,
          },
        },);
      }

      return jsonResponse({
        id: row.id,
        prompt,
        messageId: row.message_id,
        referenceModel: row.reference_model,
        preference: row.preference,
        confidence: row.confidence,
        createdAt: row.created_at,
      },);
    }, {
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Export a model comparison",
        description:
          "Returns the comparison record as JSON (default) or markdown. Format is selected via ?format=json|markdown.",
        tags: ["Comparisons",],
      },
    },);
}

interface ExportFields {
  comparisonId: string;
  prompt: string;
  referenceModel: string;
  preference: string;
  confidence: number;
  createdAt: string;
}

interface RunReport {
  id: string;
  prompt: string;
  results: unknown;
  ratings: unknown;
  metadata: unknown;
  createdAt: string;
}

function renderRunMarkdown(report: RunReport,): string {
  const lines = [
    `# Model comparison — ${report.id}`,
    "",
    `- **Recorded:** ${report.createdAt}`,
    "",
    "## Prompt",
    "",
    report.prompt,
    "",
    "## Results",
    "",
  ];
  for (const result of Array.isArray(report.results,) ? report.results : []) {
    const item = result as {
      model?: { provider?: string; name?: string };
      response?: string;
      latencyMs?: number;
      tokenCount?: number;
      cost?: number;
      status?: string;
    };
    lines.push(
      `### ${item.model?.provider ?? "unknown"} / ${item.model?.name ?? "unknown"}`,
      "",
      item.response ?? "",
      "",
      `- **Status:** ${item.status ?? "unknown"}`,
      `- **Latency:** ${item.latencyMs ?? 0} ms`,
      `- **Tokens:** ${item.tokenCount ?? 0}`,
      `- **Cost:** $${(item.cost ?? 0).toFixed(4,)}`,
      "",
    );
  }
  const ratingsJson = safeJsonStringify(report.ratings, 2,);
  const metadataJson = safeJsonStringify(report.metadata, 2,);
  lines.push("## Ratings", "", "```json", ratingsJson.ok ? ratingsJson.value : "{}", "```", "",);
  lines.push("## Metadata", "", "```json", metadataJson.ok ? metadataJson.value : "{}", "```", "",);
  return lines.join("\n",);
}

/**
 * Render the comparison record as a human-readable markdown report.
 * @param f
 */
function renderMarkdown(f: ExportFields,): string {
  const lines: string[] = [];
  lines.push(`# Model comparison — ${f.comparisonId}`,);
  lines.push("",);
  lines.push(`- **Recorded:** ${f.createdAt}`,);
  lines.push(`- **Preference:** ${f.preference}`,);
  lines.push(`- **Reference model:** ${f.referenceModel}`,);
  lines.push(`- **Confidence:** ${f.confidence}`,);
  lines.push("",);
  lines.push("## Prompt",);
  lines.push("",);
  lines.push(f.prompt || "_(no prompt text — message may be encrypted or removed)_",);
  lines.push("",);
  return lines.join("\n",);
}
