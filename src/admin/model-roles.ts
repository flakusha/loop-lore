/**
 * Model Role Resolution
 *
 * Resolves model role assignments (main, captioning, moderation)
 * with fallback: DB overrides → config defaults → server defaults.
 */
import type { Kysely } from "kysely";
import type { Config } from "../config/schema";
import type { DB } from "../db/schema";
import { getProvider } from "../generation/providers/registry";
import { getLogger } from "../logger";

export type ModelRole = "main" | "captioning" | "moderation";

export const VALID_ROLES: ModelRole[] = ["main", "captioning", "moderation"];

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
 */
export async function resolveModelRole(
  role: ModelRole,
  config: Config,
  db: Kysely<DB>,
): Promise<ResolvedModelRole> {
  if (!VALID_ROLES.includes(role)) {
    throw new Error(`Invalid model role: "${role}". Must be one of: ${VALID_ROLES.join(", ")}`);
  }

  // 1. DB overrides
  try {
    const dbOverride = await db
      .selectFrom("model_role_overrides")
      .where("role", "=", role)
      .selectAll()
      .executeTakeFirst();

    if (dbOverride) {
      return { role, provider: dbOverride.provider, model: dbOverride.model, source: "db" };
    }
  } catch (error) {
    getLogger()
      .child({ module: "model-roles" })
      .warn("Failed to read DB override", { role, error: (error as Error).message });
  }

  // 2. Config defaults
  const configRole = config.generation.modelRoles?.[role];
  if (configRole) {
    return { role, provider: configRole.provider, model: configRole.model, source: "config" };
  }

  // 3. Server defaults
  const defaultProvider = config.generation.defaultProvider;
  if (defaultProvider) {
    const defaultModel = config.generation.defaultModels[defaultProvider] ?? "";
    return { role, provider: defaultProvider, model: defaultModel, source: "default" };
  }

  return { role, provider: "", model: "", source: "default" };
}

/**
 * Resolve all model roles at once.
 */
export async function resolveAllModelRoles(config: Config, db: Kysely<DB>): Promise<ResolvedModelRole[]> {
  return Promise.all(VALID_ROLES.map((role) => resolveModelRole(role, config, db)));
}

/**
 * Set a model role override in the DB.
 */
export async function setModelRoleOverride(
  role: ModelRole,
  provider: string,
  model: string,
  db: Kysely<DB>,
): Promise<void> {
  if (!VALID_ROLES.includes(role)) {
    throw new Error(`Invalid model role: "${role}"`);
  }

  const providerInstance = getProvider(provider);
  if (!providerInstance) {
    throw new Error(`Provider "${provider}" not found`);
  }

  await db
    .insertInto("model_role_overrides")
    .values({ role, provider, model })
    .onConflict((oc) =>
      oc.column("role").doUpdateSet({
        provider,
        model,
        updated_at: new Date().toISOString(),
      })
    )
    .execute();

  getLogger().child({ module: "model-roles" }).info("Model role override set", { role, provider, model });
}

/**
 * Clear a model role override from the DB (revert to config/default).
 */
export async function clearModelRoleOverride(role: ModelRole, db: Kysely<DB>): Promise<void> {
  if (!VALID_ROLES.includes(role)) {
    throw new Error(`Invalid model role: "${role}"`);
  }

  await db.deleteFrom("model_role_overrides").where("role", "=", role).execute();
  getLogger().child({ module: "model-roles" }).info("Model role override cleared", { role });
}

/**
 * Get all current model role overrides from DB.
 */
export async function getModelRoleOverrides(
  db: Kysely<DB>,
): Promise<Record<string, { provider: string; model: string }>> {
  const rows = await db.selectFrom("model_role_overrides").selectAll().execute();
  const overrides: Record<string, { provider: string; model: string }> = {};
  for (const row of rows) {
    overrides[row.role] = { provider: row.provider, model: row.model };
  }
  return overrides;
}
