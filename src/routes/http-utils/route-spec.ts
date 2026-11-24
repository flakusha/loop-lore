// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { TSchema, } from "@sinclair/typebox";
import { ErrorResponse, } from "../../validation/schemas";

/**
 * Build Elysia route options with shared auth errors and OpenAPI detail.
 * @param spec - response map, summary, description and OpenAPI tags
 * @returns route options for an Elysia handler
 */
export function routeSpec(spec: {
  response: Record<number, TSchema>;
  summary: string;
  description: string;
  tags: string[];
  params?: TSchema;
  body?: TSchema;
  query?: TSchema;
},) {
  return {
    ...(spec.params ? { params: spec.params, } : {}),
    ...(spec.body ? { body: spec.body, } : {}),
    ...(spec.query ? { query: spec.query, } : {}),
    response: {
      ...spec.response,
      401: ErrorResponse,
      404: ErrorResponse,
    },
    detail: {
      summary: spec.summary,
      description: spec.description,
      tags: spec.tags,
    },
  };
}
