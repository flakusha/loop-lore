// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Model Capabilities Registry — persistent storage for provider-reported
 * model metadata with user-override support.
 *
 * Auto-populates from provider health scans; users can override any field
 * via the admin API. User overrides take precedence when resolving capabilities.
 */

import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import type { ModelInfo, } from "../generation/providers/types";
import { getLogger, } from "../logger";
import { jsonParseOr, jsonStringifyOr, } from "../utils/safe-json";
import type { ResolvedModelCapabilities, } from "./model-capabilities-types";

export type { ModelCapabilityRow, ResolvedModelCapabilities, } from "./model-capabilities-types";

/** Staleness threshold: 30 days. */
const STALE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Upsert model capabilities from provider-reported ModelInfo.
 * Only updates auto-detected fields — preserves user overrides.
 * @param db - Database instance.
 * @param providerId - Provider identifier.
 * @param models - List of model info objects.
 */
export async function upsertModelCapabilities(
  db: Kysely<DB>,
  providerId: string,
  models: ModelInfo[],
): Promise<void> {
  const now = new Date().toISOString();
  for (const model of models) {
    const existing = await db
      .selectFrom("model_capabilities",)
      .where("provider_id", "=", providerId,)
      .where("model_id", "=", model.id,)
      .selectAll()
      .executeTakeFirst();

    if (existing) {
      if (existing.user_override) {
        // User-overridden: only update last_seen
        await db
          .updateTable("model_capabilities",)
          .set({ last_seen: now, updated_at: now, },)
          .where("id", "=", existing.id,)
          .execute();
      } else {
        // Auto-detected: update all fields
        await db
          .updateTable("model_capabilities",)
          .set({
            context_window: model.contextWindow ?? null,
            max_output: model.maxOutput ?? null,
            supports_tools: model.toolCalling ? 1 : 0,
            supports_thinking: model.thinking ? 1 : 0,
            modalities: model.modalities ? jsonStringifyOr(model.modalities,) : null,
            param_size: model.paramSize ?? null,
            owned_by: model.ownedBy ?? null,
            last_seen: now,
            updated_at: now,
          },)
          .where("id", "=", existing.id,)
          .execute();
      }
    } else {
      await db
        .insertInto("model_capabilities",)
        .values({
          id: crypto.randomUUID(),
          provider_id: providerId,
          model_id: model.id,
          context_window: model.contextWindow ?? null,
          max_output: model.maxOutput ?? null,
          supports_tools: model.toolCalling ? 1 : 0,
          supports_vision: model.modalities?.includes("image",) ? 1 : 0,
          supports_thinking: model.thinking ? 1 : 0,
          modalities: model.modalities ? jsonStringifyOr(model.modalities,) : null,
          param_size: model.paramSize ?? null,
          owned_by: model.ownedBy ?? null,
          user_override: 0,
          notes: null,
          last_seen: now,
          created_at: now,
          updated_at: now,
        },)
        .execute();
    }
  }
  getLogger().child({ module: "model-capabilities", },).info("Upserted model capabilities", {
    providerId,
    count: models.length,
  },);
}

/**
 * Resolve merged capabilities for a specific model.
 * User overrides take precedence over auto-detected fields.
 * @param db - Database instance.
 * @param providerId - Provider identifier.
 * @param modelId - Model identifier.
 * @returns Resolved capabilities or null if not found.
 */
export async function resolveModelCapabilities(
  db: Kysely<DB>,
  providerId: string,
  modelId: string,
): Promise<ResolvedModelCapabilities | null> {
  const row = await db
    .selectFrom("model_capabilities",)
    .where("provider_id", "=", providerId,)
    .where("model_id", "=", modelId,)
    .selectAll()
    .executeTakeFirst();

  if (!row) { return null; }

  const isStale = Date.now() - new Date(row.last_seen,).getTime() > STALE_THRESHOLD_MS;

  return {
    providerId: row.provider_id,
    modelId: row.model_id,
    contextWindow: row.context_window,
    maxOutput: row.max_output,
    supportsTools: row.supports_tools === 1,
    supportsVision: row.supports_vision === 1,
    supportsThinking: row.supports_thinking === 1,
    modalities: row.modalities ? jsonParseOr<string[]>(row.modalities, [],) : [],
    paramSize: row.param_size,
    ownedBy: row.owned_by,
    isStale,
    lastSeen: row.last_seen,
    userOverride: row.user_override === 1,
    notes: row.notes,
  };
}

/**
 * List all registered model capabilities, optionally filtered by provider.
 * @param db - Database instance.
 * @param providerId - Optional provider filter.
 * @returns List of resolved capabilities.
 */
export async function listModelCapabilities(
  db: Kysely<DB>,
  providerId?: string,
): Promise<ResolvedModelCapabilities[]> {
  let query = db.selectFrom("model_capabilities",).selectAll();
  if (providerId) {
    query = query.where("provider_id", "=", providerId,);
  }
  const rows = await query.orderBy("provider_id",).orderBy("model_id",).execute();

  return Array.from(rows, (row,): ResolvedModelCapabilities => ({
    providerId: row.provider_id,
    modelId: row.model_id,
    contextWindow: row.context_window,
    maxOutput: row.max_output,
    supportsTools: row.supports_tools === 1,
    supportsVision: row.supports_vision === 1,
    supportsThinking: row.supports_thinking === 1,
    modalities: row.modalities ? jsonParseOr<string[]>(row.modalities, [],) : [],
    paramSize: row.param_size,
    ownedBy: row.owned_by,
    isStale: Date.now() - new Date(row.last_seen,).getTime() > STALE_THRESHOLD_MS,
    lastSeen: row.last_seen,
    userOverride: row.user_override === 1,
    notes: row.notes,
  }),);
}

export { clearModelOverride, getContextWindowForModel, setModelOverride, } from "./model-capabilities-overrides";
