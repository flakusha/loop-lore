// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Model Role Resolution
 *
 * Resolves model role assignments (main, captioning, moderation)
 * with fallback: DB overrides → config defaults → server defaults.
 *
 * Error-handling strategy (deliberate, do not "unify"): reads degrade to
 * the next fallback with a warn-log, while writes throw for the caller to
 * handle. The aux-pipeline callAux path relies on graceful read
 * degradation, so reads MUST NOT throw.
 */
import type { Kysely, } from "kysely";
import type { Config, } from "../config/schema";
import type { DB, } from "../db/schema";
import { getProvider, } from "../generation/providers/registry";
import { getLogger, } from "../logger";

import { ModelRole, } from "../db/enums-core";
export type { ModelRole, } from "../db/enums-core";

/** Roles manageable from the admin panel (subset of all ModelRole values). */
export const VALID_ROLES = [
  ModelRole.Main,
  ModelRole.Auxiliary,
  ModelRole.Captioning,
] as const;

/** A resolved model role with its provider, model, and source. */
export interface ResolvedModelRole {
  role: ModelRole;
  provider: string;
  model: string;
  source: "db" | "config" | "default";
}

/**
 * Resolve a model role assignment.
 *
 * Resolution order:
 * 1. DB override (model_role_overrides table)
 * 2. Config default (config.generation.modelRoles)
 * 3. Server default (config.generation.defaultProvider + defaultModels)
 * @param role - The role to resolve.
 * @param config - App config.
 * @param db - Database instance.
 * @returns The resolved model role.
 */
export async function resolveModelRole(
  role: ModelRole,
  config: Config,
  db: Kysely<DB>,
): Promise<ResolvedModelRole> {
  if (!(VALID_ROLES as readonly string[]).includes(role,)) {
    throw new Error(`Invalid model role: "${role}". Must be one of: ${VALID_ROLES.join(", ",)}`,);
  }

  // Graceful degradation: a missing/partial `config.generation` section must
  // resolve to an empty role (callAux treats empty provider/model as `null`
  // and returns without throwing), not crash on `config.generation.<field>`.
  if (!config?.generation) {
    return { role, provider: "", model: "", source: "default", };
  }

  // 1. DB overrides
  try {
    const dbOverride = await db
      .selectFrom("model_role_overrides",)
      .where("role", "=", role,)
      .selectAll()
      .executeTakeFirst();

    if (dbOverride) {
      return { role, provider: dbOverride.provider, model: dbOverride.model, source: "db", };
    }
  } catch (error) {
    getLogger()
      .child({ module: "model-roles", },)
      .warn("Failed to read DB override", { role, error: (error as Error).message, },);
  }

  // 2. Config defaults
  const configRole = config.generation.modelRoles?.[role as keyof typeof config.generation.modelRoles];
  if (configRole) {
    return { role, provider: configRole.provider, model: configRole.model, source: "config", };
  }

  // 3. Server defaults
  const defaultProvider = config.generation.defaultProvider;
  if (defaultProvider) {
    const defaultModel = config.generation.defaultModels[defaultProvider] ?? "";
    return { role, provider: defaultProvider, model: defaultModel, source: "default", };
  }

  return { role, provider: "", model: "", source: "default", };
}

/**
 * Resolve all model roles at once.
 * @param config - App config.
 * @param db - Database instance.
 * @returns All resolved model roles.
 */
export async function resolveAllModelRoles(config: Config, db: Kysely<DB>,): Promise<ResolvedModelRole[]> {
  const promises: Promise<ResolvedModelRole>[] = Array.from(VALID_ROLES, role => resolveModelRole(role, config, db,),);
  const results = await Promise.allSettled(promises,);
  const roles: ResolvedModelRole[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") { roles.push(r.value,); }
  }
  return roles;
}

/**
 * Set a model role override in the DB.
 * @param role - The role to override.
 * @param provider - Provider identifier.
 * @param model - Model identifier.
 * @param db - Database instance.
 * @param tuning - Optional temperature/maxTokens tuning.
 * @param tuning.temperature - Temperature override.
 * @param tuning.maxTokens - Max tokens override.
 */
export async function setModelRoleOverride(
  role: ModelRole,
  provider: string,
  model: string,
  db: Kysely<DB>,
  tuning?: { temperature?: number | null; maxTokens?: number | null },
): Promise<void> {
  if (!(VALID_ROLES as readonly string[]).includes(role,)) {
    throw new Error(`Invalid model role: "${role}"`,);
  }

  const providerInstance = getProvider(provider,);
  if (!providerInstance) {
    throw new Error(`Provider "${provider}" not found`,);
  }

  await db
    .insertInto("model_role_overrides",)
    .values({
      role,
      provider,
      model,
      temperature: tuning?.temperature ?? null,
      max_tokens: tuning?.maxTokens ?? null,
    },)
    .onConflict((oc,) =>
      oc.column("role",).doUpdateSet({
        provider,
        model,
        temperature: tuning?.temperature ?? null,
        max_tokens: tuning?.maxTokens ?? null,
        updated_at: new Date().toISOString(),
      },)
    )
    .execute();

  getLogger().child({ module: "model-roles", },).info("Model role override set", { role, provider, model, },);
}

/**
 * Clear a model role override from the DB (revert to config/default).
 * @param role - The role to clear.
 * @param db - Database instance.
 */
export async function clearModelRoleOverride(role: ModelRole, db: Kysely<DB>,): Promise<void> {
  if (!(VALID_ROLES as readonly string[]).includes(role,)) {
    throw new Error(`Invalid model role: "${role}"`,);
  }

  await db.deleteFrom("model_role_overrides",).where("role", "=", role,).execute();
  getLogger().child({ module: "model-roles", },).info("Model role override cleared", { role, },);
}

/**
 * Get all current model role overrides from DB.
 * @param db - Database instance.
 * @returns Map of role to override details.
 */
export async function getModelRoleOverrides(
  db: Kysely<DB>,
): Promise<Record<string, { provider: string; model: string; temperature: number | null; maxTokens: number | null }>> {
  const rows = await db.selectFrom("model_role_overrides",).selectAll().execute();
  const overrides: Record<
    string,
    { provider: string; model: string; temperature: number | null; maxTokens: number | null }
  > = {};
  for (const row of rows) {
    overrides[row.role] = {
      provider: row.provider,
      model: row.model,
      temperature: row.temperature,
      maxTokens: row.max_tokens,
    };
  }
  return overrides;
}
