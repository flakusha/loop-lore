// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/characters/seed/identity.ts — Stable identity for seeded characters
//
// Boot seeding is idempotent: an actor row that already exists is never
// touched (in-app edits, including display_name renames, survive). `actors.id`
// is that identity — not `display_name`, the one field the character edit route
// lets users change freely, which is what re-seeded a renamed character as a
// duplicate (BUG-character-seed-dedupes-on-display-name).
//
// UPGRADE: rows seeded before this change carry a crypto-random `uid()` in
// `actors.id`, so `id = <key>` misses them and the template re-seeds —
// duplicating every seeded character on the first boot after upgrade.
// Resolution therefore accepts three signals: the row's own id, a `seedKey`
// marker in its `actors.settings` blob, and the pre-change (owner,
// display_name) key. Only the last can match a pre-upgrade row; matching it
// stamps the marker once, so every later boot resolves by id alone. A matched
// row's existing id is never rewritten — no foreign key on `actors.id`
// cascades on update.

import { type Kysely, sql, } from "kysely";
import type { DB, } from "../../db/schema";
import { safeJsonParse, safeJsonStringify, } from "../../utils";

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
 * Short deterministic digest of `value`. A slug alone is not injective: two
 * distinct names differing only in punctuation (`"Dr. Thorne"` /
 * `"Dr.Thorne"`) slug identically, so they would resolve to one `actors.id`
 * and the second template would be silently skipped as already seeded. The
 * digest puts every distinct entry on its own row while staying byte-identical
 * across boots, config edits and machines.
 * @param value - Exact string to fingerprint
 * @returns Lowercase hex prefix of the SHA-256 digest
 */
function shortDigest(value: string,): string {
  const hasher = new Bun.CryptoHasher("sha256",);
  hasher.update(value,);
  return hasher.digest("hex",).slice(0, 12,);
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
  return template.id ?? `tpl-${slugifyName(template.name,)}-${shortDigest(template.name,)}`;
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
  // `\0` cannot occur in a config string, so the concatenation is injective;
  // the digest then guarantees two distinct pairs never share one row.
  const key = `${owner}\0${name}`;
  return `seed-${slugifyName(key,)}-${shortDigest(key,)}`;
}

/** Key recorded in `actors.settings` naming the config entry that seeded a row.
 * `settings` is already the actors metadata blob and `json_extract` over it is
 * this repo's established pattern (`turn-skip-absence.ts`), so adopting a
 * legacy row needs no schema change, no migration and no primary-key rewrite. */
const SEED_KEY_SETTING = "seedKey";

/** An actor row that a config entry already owns. */
export interface ExistingActor {
  /** The row's own `actors.id`. Kept as-is — never rewritten. */
  readonly id: string;
  /** True when the row matched only the pre-change key and still has a random id. */
  readonly needsAdoption: boolean;
}

/** The pre-change identity of a seeded row, matching the old lookup exactly. */
export interface LegacyIdentity {
  /** Owning user, or null for the system scope. */
  readonly ownerId: string | null;
  /** Display name the row had when it was seeded — the key the old code used. */
  readonly seededAs: string;
}

/**
 * Look up the actor row a config entry already owns, so re-seeding is a no-op
 * and a user rename cannot create a second row.
 *
 * Signals, cheapest first: the row's own id (rows this code created), the
 * `seedKey` settings marker (rows adopted from a legacy id), then the
 * pre-change (owner, display_name) key — which only a row seeded by the old
 * code can match, and never a fresh row, because fresh rows carry their
 * deterministic id as the primary key.
 * @param database - Kysely instance
 * @param actorId - Stable id the config entry resolves to
 * @param legacy - Pre-change key this row would have been found by
 * @returns The existing row, or null when the entry has never been seeded
 */
export async function findExistingActor(
  database: Kysely<DB>,
  actorId: string,
  legacy: LegacyIdentity,
): Promise<ExistingActor | null> {
  const byId = await database
    .selectFrom("actors",)
    .select("id",)
    .where("id", "=", actorId,)
    .executeTakeFirst();

  if (byId) { return { id: byId.id, needsAdoption: false, }; }

  const byMarker = await database
    .selectFrom("actors",)
    .select("id",)
    .where(sql<boolean>`json_extract(settings, '$.seedKey') = ${actorId}`,)
    .executeTakeFirst();

  if (byMarker) { return { id: byMarker.id, needsAdoption: false, }; }

  const legacyRow = await database
    .selectFrom("actors",)
    .select("id",)
    .where("display_name", "=", legacy.seededAs,)
    .where((eb,) =>
      legacy.ownerId === null
        ? eb("owner_id", "is", null,)
        : eb("owner_id", "=", legacy.ownerId,)
    )
    .executeTakeFirst();

  return legacyRow ? { id: legacyRow.id, needsAdoption: true, } : null;
}

/**
 * Converge a pre-upgrade row onto the stable identity by stamping its
 * `seedKey` marker, so later boots resolve it by id and a rename is a no-op.
 * Idempotent: a row already carrying the key is left untouched.
 * @param database - Kysely instance
 * @param actorId - Row to adopt (must already exist)
 * @param seedKey - Stable identity to record
 * @returns {Promise<void>}
 */
export async function adoptExistingActor(database: Kysely<DB>, actorId: string, seedKey: string,): Promise<void> {
  const row = await database
    .selectFrom("actors",)
    .select("settings",)
    .where("id", "=", actorId,)
    .executeTakeFirst();

  if (!row) { return; }

  const parsed = safeJsonParse<Record<string, unknown>>(row.settings,);
  const settings =
    parsed.ok && parsed.value !== null && typeof parsed.value === "object" && !Array.isArray(parsed.value,)
      ? parsed.value
      : {};

  if (settings[SEED_KEY_SETTING] === seedKey) { return; }

  const encoded = safeJsonStringify({ ...settings, [SEED_KEY_SETTING]: seedKey, },);

  if (!encoded.ok) { return; }

  await database
    .updateTable("actors",)
    .set({ settings: encoded.value, },)
    .where("id", "=", actorId,)
    .execute();
}
