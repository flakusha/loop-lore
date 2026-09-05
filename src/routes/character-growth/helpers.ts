// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character-growth route helpers — TypeBox request schemas, error
 * mapping, and unknown-record type guards.
 *
 * Split from `index.ts` for size-strict compliance. Each helper has
 * a single responsibility:
 *   - `upsertArcBody` / `listLogQuery` — request-shape validation
 *   - `errResponse` — service error → HTTP response mapping
 *   - `getString` / `getNumber` / `getBoolean` — defensive parsers for
 *     untyped param/query bags before they reach the service layer
 */

import { t, } from "elysia";
import { GrowthServiceError, } from "../../characters/services/growth-service";
import { ArcStage, GrowthAxis, GrowthEntryStatus, } from "../../characters/spec/growth";
import { jsonError, } from "../http-utils";

/** Request body for PATCH /arc — accepts a stage + optional description. */
export const upsertArcBody = t.Object({
  currentStage: t.Union([
    t.Literal(ArcStage.Introduction,),
    t.Literal(ArcStage.RisingAction,),
    t.Literal(ArcStage.Crisis,),
    t.Literal(ArcStage.Resolution,),
    t.Literal(ArcStage.Epilogue,),
  ],),
  stageDescription: t.Optional(t.String(),),
},);

/** Query params for GET /log — actor + optional filters. */
export const listLogQuery = t.Object({
  actorId: t.String(),
  axis: t.Optional(t.Union([
    t.Literal(GrowthAxis.Arc,),
    t.Literal(GrowthAxis.Skill,),
    t.Literal(GrowthAxis.Trait,),
    t.Literal(GrowthAxis.Relationship,),
  ],),),
  status: t.Optional(t.Union([
    t.Literal(GrowthEntryStatus.Pending,),
    t.Literal(GrowthEntryStatus.Applied,),
    t.Literal(GrowthEntryStatus.Rejected,),
  ],),),
  limit: t.Optional(t.Number(),),
  includePending: t.Optional(t.Boolean(),),
},);

/** Map service-layer growth errors to HTTP responses. */
export function errResponse(err: unknown,): Response {
  if (err instanceof GrowthServiceError) {
    if (err.code === "static_mode_forbidden") { return jsonError(err.message, 409,); }
    if (err.code === "integrity_forbidden") { return jsonError(err.message, 409,); }
    if (err.code === "not_found") { return jsonError(err.message, 404,); }
    if (err.code === "already_resolved") { return jsonError(err.message, 409,); }
    if (err.code === "invalid_input") { return jsonError(err.message, 400,); }
  }
  return jsonError("Internal server error", 500,);
}

/** Type guard for unknown optional string params/query values. */
export function getString(obj: unknown, key: string,): string | undefined {
  if (obj === null || typeof obj !== "object") { return undefined; }
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === "string" ? v : undefined;
}

/** Type guard for unknown optional numeric params/query values. */
export function getNumber(obj: unknown, key: string,): number | undefined {
  if (obj === null || typeof obj !== "object") { return undefined; }
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === "number" ? v : undefined;
}

/** Type guard for unknown optional boolean params/query values. */
export function getBoolean(obj: unknown, key: string,): boolean | undefined {
  if (obj === null || typeof obj !== "object") { return undefined; }
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === "boolean" ? v : undefined;
}
