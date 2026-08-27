// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Model capability override operations — user overrides, clear, and context window lookup.
 */

import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { resolveModelCapabilities, } from "./model-capabilities";

/**
 * Set user override for a model's capabilities.
 * Only updates fields provided in the override — preserves others.
 * @param db - Database instance.
 * @param providerId - Provider identifier.
 * @param modelId - Model identifier.
 * @param override - Fields to override.
 * @param override.contextWindow - Context window size override.
 * @param override.maxOutput - Max output tokens override.
 * @param override.supportsTools - Tools support override.
 * @param override.supportsVision - Vision support override.
 * @param override.supportsThinking - Thinking support override.
 * @param override.notes - Notes override.
 * @returns True if the model was found and updated.
 */
export async function setModelOverride(
  db: Kysely<DB>,
  providerId: string,
  modelId: string,
  override: {
    contextWindow?: number | null;
    maxOutput?: number | null;
    supportsTools?: boolean | null;
    supportsVision?: boolean | null;
    supportsThinking?: boolean | null;
    notes?: string | null;
  },
): Promise<boolean> {
  const existing = await db
    .selectFrom("model_capabilities",)
    .where("provider_id", "=", providerId,)
    .where("model_id", "=", modelId,)
    .selectAll()
    .executeTakeFirst();

  if (!existing) { return false; }

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {
    user_override: 1,
    updated_at: now,
  };

  if (override.contextWindow !== undefined) { updates.context_window = override.contextWindow; }
  if (override.maxOutput !== undefined) { updates.max_output = override.maxOutput; }
  if (override.supportsTools !== undefined) { updates.supports_tools = override.supportsTools ? 1 : 0; }
  if (override.supportsVision !== undefined) { updates.supports_vision = override.supportsVision ? 1 : 0; }
  if (override.supportsThinking !== undefined) { updates.supports_thinking = override.supportsThinking ? 1 : 0; }
  if (override.notes !== undefined) { updates.notes = override.notes; }

  await db
    .updateTable("model_capabilities",)
    .set(updates,)
    .where("id", "=", existing.id,)
    .execute();

  return true;
}

/**
 * Clear user override — revert to auto-detected values.
 * @param db - Database instance.
 * @param providerId - Provider identifier.
 * @param modelId - Model identifier.
 * @returns True if the model was found and updated.
 */
export async function clearModelOverride(
  db: Kysely<DB>,
  providerId: string,
  modelId: string,
): Promise<boolean> {
  const result = await db
    .updateTable("model_capabilities",)
    .set({ user_override: 0, updated_at: new Date().toISOString(), },)
    .where("provider_id", "=", providerId,)
    .where("model_id", "=", modelId,)
    .execute();

  return result.length > 0;
}

/**
 * Get the context window size for a model from the registry.
 * Returns null if model not found (caller should use default).
 * @param db - Database instance.
 * @param providerId - Provider identifier.
 * @param modelId - Model identifier.
 * @returns Context window size or null.
 */
export async function getContextWindowForModel(
  db: Kysely<DB>,
  providerId: string,
  modelId: string,
): Promise<number | null> {
  const caps = await resolveModelCapabilities(db, providerId, modelId,);
  return caps?.contextWindow ?? null;
}
