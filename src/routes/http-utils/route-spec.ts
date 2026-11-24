// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { TSchema, } from "@sinclair/typebox";
import { ErrorResponse, } from "../../validation/schemas";

/**
 * Shared Elysia option fragments: standard auth errors and OpenAPI detail.
 * Spread inline into route options so Elysia still infers exact `params`,
 * `body` and `query` for unannotated handlers; a factory call as the whole
 * options object loses inference in this Elysia version.
 * @param spec - response map, summary, description and OpenAPI tags
 * @returns `response` with 401/404 and `detail` for inline spreading
 */
export function routeSpec<const TResponse extends Record<number, TSchema>,>(spec: {
  response: TResponse;
  summary: string;
  description: string;
  tags: string[];
},) {
  return {
    response: {
      ...spec.response,
      401: ErrorResponse,
      404: ErrorResponse,
    } as const,
    detail: {
      summary: spec.summary,
      description: spec.description,
      tags: spec.tags,
    } as const,
  } as const;
}

/** 401 entry for routes that declare auth failures but no 404. */
export function routeAuthError() {
  return { 401: ErrorResponse, };
}

/** 404 entry for routes that declare a missing resource but no 401. */
export function routeNotFoundError() {
  return { 404: ErrorResponse, };
}
/** Standard auth error entries for inline Elysia response maps. */
export function routeErrors() {
  return { ...routeAuthError(), ...routeNotFoundError(), };
}

/** OpenAPI detail entry for inline Elysia route options. */
export function routeDetail(spec: {
  summary: string;
  description?: string;
  tags: string[];
},) {
  return {
    detail: {
      summary: spec.summary,
      ...(spec.description ? { description: spec.description, } : {}),
      tags: spec.tags,
    },
  };
}
