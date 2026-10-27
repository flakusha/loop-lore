// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Entity adapter contracts for the assistant entity-access commands
 * (`/duplicate`, `/adapt`).
 *
 * The adapters COMPOSE with the existing access guards and services
 * (`requireOwnedCharacter`, `requireOwnedWorldEntity`, `insertGeneratedEntity`)
 * — no new access layer. Command handlers stay thin: parse → load through the
 * adapter → preview action; persistence only happens in the confirm route.
 */

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";

/** Entity kinds the duplication surface supports. */
export const DUPLICATE_ENTITY_KINDS = ["character", "world", "location", "item",] as const;

/** Entity kinds the adaptation surface supports. */
export const ADAPT_ENTITY_KINDS = ["character", "location", "item",] as const;

export type DuplicateEntityKind = (typeof DUPLICATE_ENTITY_KINDS)[number];
export type AdaptEntityKind = (typeof ADAPT_ENTITY_KINDS)[number];

/** Copiable fields of one entity, keyed the way the create route accepts them. */
export type EntityFields = Record<string, string | number | boolean | string[] | Record<string, unknown>>;

/** A guarded load of one entity for copying/adapting. */
export interface LoadedEntity {
  /** Source display name (before any rename). */
  name: string;
  /** World the entity lives in (undefined for characters). */
  worldId?: string;
  fields: EntityFields;
  /** Extra preview note (fields deliberately not copied). */
  note?: string;
}

export type LoadedEntityResult =
  | { ok: true; entity: LoadedEntity }
  | { ok: false; message: string };

/**
 * A per-kind entity adapter: the minimal surface the duplicate/adapt
 * commands need, delegating to the existing service layer.
 */
export interface EntityAdapter {
  readonly kind: DuplicateEntityKind;
  /** Load the entity behind its route's own ownership guard. */
  loadForCopy(db: Kysely<DB>, id: string, userId: string | null, userRole: string | null,): Promise<LoadedEntityResult>;
}
