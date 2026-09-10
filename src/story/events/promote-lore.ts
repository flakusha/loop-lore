// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Event → Lore Promotion
 *
 * Converts a validated world event into a structured `world_lore_entries` row,
 * optionally tagged with an audience scope. This is the propagation loop behind
 * docs/spec/lore.md §4: actions mutate the world → become lore → become
 * audience-scoped knowledge → injected back into matching characters' prompts.
 *
 * Unlike the legacy `worlds.lore` text blob, a promoted row carries `audience_scope`
 * JSON and is picked up by `loreSection` exactly like any authored world lore entry.
 */
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import { isValidUuid, type LoreScope, } from "../../assistant/lore/audience";
import { LoreEntryStatus, LorePosition, } from "../../db/enums-story";
import type { DB, } from "../../db/schema";
import { safeJsonStringify, } from "../../utils";

/** Known subject kinds accepted at promotion time (docs/spec/lore.md §3.2). */
export const KNOWN_SUBJECT_KINDS: Record<string, true> = {
  world: true,
  location: true,
  profession: true,
  race: true,
};

/**
 * Validate an event-carried `audienceScope` value and return a clean `LoreScope`,
 * or null when absent/invalid. Structure mirrors `parseLoreScope` but accepts an
 * already-parsed object (events carry objects, not JSON strings).
 *
 * Selector completeness is enforced:
 * - profession: non-empty string required
 * - race: non-empty string required
 * - location: locationId must be a valid UUID when present
 * @param value
 */
export function normalizeAudienceScope(value: unknown,): LoreScope | null {
  if (!value || typeof value !== "object") { return null; }
  const scope = value as Record<string, unknown>;

  const rawSubject = scope.subject;
  if (rawSubject === undefined) { return { requires_presence: undefined, }; }
  if (!rawSubject || typeof rawSubject !== "object") { return null; }

  const subject = rawSubject as Record<string, unknown>;
  const kind = subject.kind;
  if (typeof kind !== "string" || !(kind in KNOWN_SUBJECT_KINDS)) { return null; }

  const normalized: LoreScope = { subject: { kind, } as LoreScope["subject"], };

  if (kind === "location") {
    const locationId = subject.locationId;
    if (typeof locationId !== "string" || !isValidUuid(locationId,)) { return null; }
    normalized.subject = { kind: "location" as const, locationId, };
  }
  if (kind === "profession") {
    const profession = subject.profession;
    if (typeof profession !== "string" || profession.trim() === "") { return null; }
    normalized.subject = { kind: "profession" as const, profession, };
  }
  if (kind === "race") {
    const race = subject.race;
    if (typeof race !== "string" || race.trim() === "") { return null; }
    normalized.subject = { kind: "race" as const, race, };
  }

  if (typeof scope.requires_presence === "boolean") {
    normalized.requires_presence = scope.requires_presence;
  }

  return normalized;
}

/**
 * Promote a validated world event into a `world_lore_entries` row.
 * @param db      Database handle.
 * @param worldId World the event belongs to.
 * @param event   The validated world event to promote.
 * @param event.description
 * @param event.data
 * @returns The new entry's id, or null when there is nothing to promote.
 */
export async function promoteEventToLore(
  db: Kysely<DB>,
  worldId: string,
  event: {
    description: string;
    data: Record<string, unknown>;
  },
): Promise<string | null> {
  const content = typeof event.data.newLoreEntry === "string"
    ? event.data.newLoreEntry.trim()
    : event.description?.trim();
  if (!content) { return null; }

  const name = typeof event.data.name === "string" ? event.data.name : null;
  const audienceScope = normalizeAudienceScope(event.data.audienceScope,);

  // audienceScope is already a validated LoreScope object; serialization is safe.
  const scopeJson = audienceScope ? safeJsonStringify(audienceScope,) : null;
  const audienceScopeJson = scopeJson?.ok ? scopeJson.value : null;

  const id = randomUUID();
  await db.insertInto("world_lore_entries",).values({
    id,
    world_id: worldId,
    name,
    content,
    audience_scope: audienceScopeJson,
    enabled: LoreEntryStatus.Enabled,
    position: LorePosition.BeforeChar,
    constant: 0,
    selective: 0,
    insertion_order: 0,
    priority: 0,
    sort_order: 0,
    cooldown_seconds: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },).execute();

  return id;
}
