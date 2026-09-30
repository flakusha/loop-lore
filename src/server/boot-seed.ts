// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Content seeding performed at boot, after migrations and user seeding.
 *
 * Split out of `start.ts` because that file sits at the per-file line limit.
 * The two seeds are grouped because they share one ordering constraint: both
 * write `prompt_templates` rows, which carry a NOT NULL `owner_id`.
 */
import type { Kysely, } from "kysely";
import { seedChatSetupTemplates, } from "../chat/service";
import type { DB, } from "../db/schema";
import { seedWorkflowLibrary, } from "../generation/workflow-library";

/**
 * Seed chat setup templates, then the ComfyUI workflow library.
 *
 * The workflow seed resolves the oldest admin as owner, so it must run after
 * user seeding — `start.ts` calls this only once `seedConfiguredUsers` has.
 * @param database - Kysely handle
 * @returns {Promise<void>}
 */
export async function seedDynamicContent(database: Kysely<DB>,): Promise<void> {
  await seedChatSetupTemplates(database,);
  await seedWorkflowLibrary(database,);
}
