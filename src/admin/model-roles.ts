// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Model Role Resolution
 *
 * Resolves model role assignments (main, auxiliary, captioning, classifier,
 * translator, rerank)
 * with fallback: DB overrides → config defaults → server defaults.
 *
 * Error-handling strategy (deliberate, do not "unify"): reads degrade to
 * the next fallback with a warn-log, while writes throw for the caller to
 * handle. The aux-pipeline callAux path relies on graceful read
 * degradation, so reads MUST NOT throw.
 */
import type { Kysely, } from "kysely";
import { AUTOROUTE_SCENARIOS, type Config, } from "../config/schema";
import { EDITABLE_SYSTEM_CONFIG_KEYS, } from "../config/sections/menu-data";
import type { DB, } from "../db/schema";
import { getProvider, } from "../generation/providers/registry";
import { getLogger, } from "../logger";
import { recommendScenarioModel, } from "../models/scenario-ranking";
import { jsonParseOr, } from "../utils";
import { getConfigValue, } from "./config";

import { ModelRole, } from "../db/enums-core";
export type { ModelRole, } from "../db/enums-core";

/** Roles manageable from the admin panel (subset of all ModelRole values). */
export const VALID_ROLES = [
  ModelRole.Main,
  ModelRole.Auxiliary,
  ModelRole.Captioning,
  ModelRole.Classifier,
  ModelRole.Translator,
  ModelRole.Rerank,
] as const;

/** A resolved model role with its provider, model, and source. */
export interface ResolvedModelRole {
  role: ModelRole;
  provider: string;
  model: string;
  source: "db" | "config" | "ranking" | "default";
}

/**
 * Pick a scenario-ranked model from the configured default models.
 * @param role - role being resolved (warning context only)
 * @param scenario - requested use case
 * @param defaultModels - provider → model map
 * @param db - database instance
 * @returns the ranked provider/model, or null when nothing can be ranked
 */
async function scenarioDefault(
  role: ModelRole,
  scenario: string,
  defaultModels: Record<string, string>,
  db: Kysely<DB>,
): Promise<{ provider: string; model: string } | null> {
  const entries = Object.entries(defaultModels ?? {},);
  try {
    const recommended = await recommendScenarioModel(
      db,
      scenario,
      entries.map(([, model,],) => model),
    );

    if (recommended === null) { return null; }

    const provider = entries.find(([, model,],) => model === recommended.modelId)?.[0] ?? "";
    return { provider, model: recommended.modelId, };
  } catch (error) {
    getLogger()
      .child({ module: "model-roles", },)
      .warn("Failed to read scenario ranking", { role, error: (error as Error).message, },);

    return null;
  }
}

/**
 * Parse an admin-edited modelRoles JSON value; invalid or partial rows are ignored.
 * @param raw - stored system_config value
 * @returns assignments keyed by valid role, or undefined when unusable
 */
function parseStoredModelRoles(raw: string | undefined,): Config["generation"]["modelRoles"] | undefined {
  if (!raw) { return undefined; }
  const parsed = jsonParseOr<unknown>(raw, undefined,);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed,)) { return undefined; }

  const result: NonNullable<Config["generation"]["modelRoles"]> = {};
  for (const [role, assignment,] of Object.entries(parsed,)) {
    if (!(VALID_ROLES as readonly string[]).includes(role,)) { continue; }
    if (typeof assignment !== "object" || assignment === null) { continue; }
    const value = assignment as Record<string, unknown>;
    if (typeof value.provider === "string" && typeof value.model === "string") {
      result[role as keyof typeof result] = { provider: value.provider, model: value.model, };
    }
  }

  return Object.keys(result,).length > 0 ? result : undefined;
}

/**
 * Resolve a model role assignment.
 *
 * Resolution order:
 * 1. DB override (model_role_overrides table) — bypasses ranking
 * 2. Config default (config.generation.modelRoles) — bypasses ranking
 * 3. Scenario ranking, when a scenario is supplied and ranking rows exist
 * 4. Server default (config.generation.defaultProvider + defaultModels)
 * @param role - The role to resolve.
 * @param config - App config.
 * @param db - Database instance.
 * @param opts - Optional scenario for ranking-based selection; falls back to config.generation.autorouteScenario.
 * @returns The resolved model role.
 * @throws {Error}
 */
export async function resolveModelRole(
  role: ModelRole,
  config: Config,
  db: Kysely<DB>,
  opts: { scenario?: string } = {},
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

  let storedScenario: string | undefined;
  let storedRoles: string | undefined;
  try {
    storedScenario = await getConfigValue(db, EDITABLE_SYSTEM_CONFIG_KEYS.autorouteScenario,);
    storedRoles = await getConfigValue(db, EDITABLE_SYSTEM_CONFIG_KEYS.modelRoles,);
  } catch (error) {
    getLogger()
      .child({ module: "model-roles", },)
      .warn("Failed to read stored model-role config keys", { error: (error as Error).message, },);
  }

  const storedValidScenario = storedScenario !== undefined &&
      (AUTOROUTE_SCENARIOS as readonly string[]).includes(storedScenario,)
    ? storedScenario as Config["generation"]["autorouteScenario"]
    : undefined;

  // Explicit caller scenario wins; config-menu DB overrides come next.
  const scenario = opts.scenario ?? storedValidScenario ?? config.generation.autorouteScenario;
  const roles = parseStoredModelRoles(storedRoles,) ?? config.generation.modelRoles;

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
  const configRole = roles?.[role as keyof NonNullable<typeof roles>];
  if (configRole) {
    return { role, provider: configRole.provider, model: configRole.model, source: "config", };
  }

  // 3. Scenario ranking. An explicit DB/config assignment above already
  // bypassed it; a missing ranking degrades to the server default below.
  if (scenario) {
    const ranked = await scenarioDefault(role, scenario, config.generation.defaultModels, db,);
    if (ranked !== null) {
      return { role, ...ranked, source: "ranking", };
    }
  }

  // 4. Server defaults
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
 * @throws {Error}
 * @throws {Error}
 * @returns {Promise<void>}
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
 * @throws {Error}
 * @returns {Promise<void>}
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
