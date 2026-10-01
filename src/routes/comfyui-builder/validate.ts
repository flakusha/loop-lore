// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Builder graph validate endpoint — static checks only (node shape,
 * duplicate ids, dangling link sources, acyclicity, dead-node sink rule);
 * no ComfyUI round-trip.
 */
import { Elysia, } from "elysia";
import { validateGraph, } from "../../generation/builder";
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
      return jsonResponse({ ok: result.ok, issues: result.issues, },);
    }, {
      body: GraphValidateBody,
      response: { 200: SuccessResponse, 401: ErrorResponse, },
      detail: { summary: "Statically validate a ComfyUI graph", tags: ["ComfyUI Builder",], },
    },);
}
