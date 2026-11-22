// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Builder graph validate endpoint — static checks only (node shape,
 * duplicate ids, dangling link sources, acyclicity, dead-node sink rule);
 * no ComfyUI round-trip.
 */
import { Elysia, } from "elysia";
import { validateGraph, } from "../../generation/builder";
import type { GraphIssue, GraphIssueKind, } from "../../generation/builder";
import type { ComfyUIWorkflow, } from "../../generation/providers/comfyui";
import { validateGeneratedGraph, } from "../../generation/workflow-loader/generated-validation";
import {
  ErrorResponse,
  GraphValidateBody,
  SuccessResponse,
} from "../../validation/schemas";
import { jsonResponse, requireUserId, } from "../http-utils";

/**
 * @param prefix - Route prefix
 * @returns the Elysia plugin mounting the validate route
 */
export function builderValidateRoutes(prefix = "/api",) {
  return new Elysia({ name: "comfyui-builder-validate", },)
    .post(`${prefix}/comfyui-builder/validate`, async (ctx,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const body = ctx.body as { workflow?: unknown };
      const result = validateGraph(body.workflow,);
      const issues: GraphIssue[] = [...result.issues,];

      // The array form is an editor transport shape; the generated graph
      // gate works on the API-format record the builder submits.
      if (
        result.ok && typeof body.workflow === "object" && body.workflow !== null &&
        !Array.isArray(body.workflow,)
      ) {
        const generated = validateGeneratedGraph(body.workflow as ComfyUIWorkflow,);
        for (const message of generated.errors) {
          let kind: GraphIssueKind = "invalid_shape";
          if (message.includes("no terminal sink",)) { kind = "no_sink"; }
          if (message.includes("unresolved placeholder",)) { kind = "placeholder"; }
          issues.push({ kind, message, },);
        }
      }

      return jsonResponse({ ok: issues.length === 0, issues, },);
    }, {
      body: GraphValidateBody,
      response: { 200: SuccessResponse, 401: ErrorResponse, },
      detail: { summary: "Statically validate a ComfyUI graph", tags: ["ComfyUI Builder",], },
    },);
}
