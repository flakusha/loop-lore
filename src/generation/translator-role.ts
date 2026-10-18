// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Translator model role resolution.
 *
 * The `translator` role selects the model used for `/translate` and per-chat
 * auto-translate. Resolution mirrors every other role (DB override → config
 * `generation.modelRoles.translator` → server default) and therefore inherits
 * the general model as its fallback: with no translator assignment anywhere,
 * `resolveModelRole` returns `defaultProvider` + `defaultModels[...]` — exactly
 * what the general role resolves to.
 *
 * This module is the ONE place that knows a translator model may fall back to
 * the general one. Callers must not re-implement `translator ?? general`.
 *
 * @module generation/translator-role
 */

import type { Kysely, } from "kysely";
import { resolveModelRole, } from "../admin/model-roles";
import type { Config, } from "../config/schema";
import { ModelRole, } from "../db/enums-core";
import type { DB, } from "../db/schema";

/** Where the effective translator assignment came from. */
export type TranslatorRoleSource = "db" | "config" | "general-fallback";

/** The effective translator assignment plus its provenance. */
export interface TranslatorRoleResolution {
  /** Provider name to translate with (empty when nothing is configured). */
  provider: string;
  /** Model id to translate with (empty when nothing is configured). */
  model: string;
  /** `general-fallback` means no translator was configured and the general model was used. */
  source: TranslatorRoleSource;
}

/**
 * Resolve the effective translator model/provider.
 *
 * An assignment only counts when BOTH provider and model are present — a
 * half-configured translator is treated as unset rather than producing a
 * request against an empty provider name. When no translator is configured the
 * general model's provider/model is returned with source `general-fallback`.
 *
 * @param config - Application config.
 * @param db - Database instance (read for the DB role override).
 * @returns The effective translator assignment and its provenance.
 */
export async function resolveTranslatorRole(config: Config, db: Kysely<DB>,): Promise<TranslatorRoleResolution> {
  const translator = await resolveModelRole(ModelRole.Translator, config, db,);

  // No usable translator assignment — either resolveModelRole bottomed out at
  // the server default, or the assignment is missing provider/model and cannot
  // address a provider. Both cases fall back to the general model, resolved
  // through the `main` role so a `main` DB override is honoured too (the
  // server-default rung alone would silently ignore it).
  if (translator.source === "default" || !translator.provider || !translator.model) {
    const general = await resolveModelRole(ModelRole.Main, config, db,);
    return { provider: general.provider, model: general.model, source: "general-fallback", };
  }

  return { provider: translator.provider, model: translator.model, source: translator.source, };
}
