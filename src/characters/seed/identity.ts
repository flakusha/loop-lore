// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/characters/seed/identity.ts — Stable identity for seeded characters
//
// Boot seeding is idempotent: an actor row that already exists is never
// touched (in-app edits, including display_name renames, survive). The row's
// own `actors.id` is that identity — there is no separate slug column, and
// `display_name` is the one field the character edit route lets users change
// freely, so keying on it re-seeds a renamed character as a duplicate.
//
// Mirrors `src/chat/service/templates.ts`, which derives its seed id from the
// template's own stable key rather than a mutable display field.
//
// BUG-character-seed-dedupes-on-display-name.

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";

/**
 * Slugify a display name into a stable id fragment: lowercased, non-alphanumeric
 * runs collapsed to `-`, trimmed. An explicit template id stays preferred — this
 * only backs the `id`-less case.
 * @param name - Raw display name
 * @returns Slug fragment (empty when `name` has no alphanumerics)
 */
export function slugifyName(name: string,): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-",)
    .replace(/^-+|-+$/g, "",);
}

/**
 * Resolve the stable `actors.id` a character template owns across boots.
 * An explicit `template.id` wins (all built-in character templates carry one).
 * A template without one gets a deterministic id derived from its name, so two
 * boots of the same config resolve the same row instead of minting a fresh
 * `uid()` each time.
 * @param template - Character template with a stable `name` and optional `id`
 * @returns The actor row id identifying this template across boots
 */
export function stableTemplateId(template: { readonly id?: string; readonly name: string },): string {
  return template.id ?? `tpl-${slugifyName(template.name,)}`;
}

/**
 * Resolve the stable `actors.id` a config-seeded character owns. Unlike
 * {@link stableTemplateId} there is no explicit id to honour, so the id is
 * derived from the owner-qualified config key. Qualifying by owner is required:
 * `actors.id` is the table's primary key, so two owners holding a character of
 * the same name would otherwise collide.
 * @param owner - Config username of the owning seeded user
 * @param name - Character display name from config
 * @returns The actor row id identifying this character across boots
 */
export function stableSeedCharacterId(owner: string, name: string,): string {
  return `seed-${slugifyName(owner,)}-${slugifyName(name,)}`;
}

/**
 * Look up the actor row a template already owns, by stable id — never by
 * `display_name`, so a user rename cannot create a second row.
 * @param database - Kysely instance
 * @param actorId - Stable id the template resolves to
 * @returns The existing row's id, or null when the template has never been seeded
 */
export async function findExistingActor(database: Kysely<DB>, actorId: string,): Promise<string | null> {
  const row = await database
    .selectFrom("actors",)
    .select("id",)
    .where("id", "=", actorId,)
    .executeTakeFirst();

  return row?.id ?? null;
}
