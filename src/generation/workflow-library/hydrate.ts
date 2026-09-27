// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Hydrates the image-edit `TemplateRegistry` from workflow library rows.
 *
 * `GET /api/v1/image-edit/templates` already reads the registry, so this is
 * the whole of what "uploaded workflows are discoverable" requires — no
 * change to that route. It was not reading a hardcoded list, contrary to the
 * epic's Phase 1 note; the gap was that nothing ever put DB rows in.
 *
 * Rows that fail to parse are logged and skipped rather than throwing, so one
 * corrupt row cannot leave the registry empty.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { templateRegistry, } from "../../image-edit/template-registry";
import type { TemplateRegistry, } from "../../image-edit/template-registry";
import { getLogger, } from "../../logger";
import { rowToTemplate, type WorkflowRow, } from "./row";

/** Library row columns the projection reads. */
const WORKFLOW_COLUMNS = [
  "id",
  "name",
  "description",
  "model_family",
  "payload",
  "is_default",
  "enabled",
  "lora_slots",
  "min_vram",
] as const;

/**
 * Load every enabled workflow row into the registry.
 *
 * Replaces prior library registrations but leaves the built-in TypeScript
 * templates alone, so calling this after `registerBuiltinTemplates` is safe.
 * @param database - Kysely handle
 * @param registry - Registry to populate; defaults to the singleton
 */
export async function hydrateWorkflowRegistry(
  database: Kysely<DB>,
  registry: TemplateRegistry = templateRegistry,
): Promise<number> {
  const log = getLogger().child({ module: "workflow-library", },);
  const rows = await database
    .selectFrom("prompt_templates",)
    .select(WORKFLOW_COLUMNS,)
    .where("modality", "=", "workflow",)
    .execute();

  let registered = 0;
  for (const row of rows as WorkflowRow[]) {
    const template = rowToTemplate(row,);
    if (!template) {
      log.warn("skipping unusable workflow row", { id: row.id, enabled: row.enabled, },);
      continue;
    }
    registry.register(template,);
    registered += 1;
  }

  log.info("hydrated workflow registry", { registered, total: rows.length, },);
  return registered;
}

let hydrated: Promise<number> | null = null;

/**
 * Hydrate once, memoized, so every mount of the image-edit routes shares it.
 *
 * Awaited by the templates listing rather than kicked off at boot: that keeps
 * the registry correct in tests and e2e (which never run `start.ts`) and means
 * the list can never be served before hydration finished. A failure clears the
 * memo so a transient DB error is not cached forever.
 * @param database - Kysely handle
 * @param registry - Registry to populate; defaults to the singleton
 */
export function ensureWorkflowRegistry(
  database: Kysely<DB>,
  registry: TemplateRegistry = templateRegistry,
): Promise<number> {
  hydrated ??= hydrateWorkflowRegistry(database, registry,).catch((error: unknown,) => {
    hydrated = null;
    throw error;
  },);
  return hydrated;
}

/**
 * Force the next `ensureWorkflowRegistry` to re-read the library.
 *
 * Called by the admin surface after a create/update/delete so the public
 * template list does not serve a stale registry until restart.
 */
export function invalidateWorkflowRegistry(): void {
  hydrated = null;
}

/** Test seam: forget the memoized hydration. */
export function resetWorkflowRegistryForTests(): void {
  hydrated = null;
}
