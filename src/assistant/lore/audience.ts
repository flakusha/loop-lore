/**
 * Lore Audience Resolution
 *
 * Pure functions — no DB access. Determines whether a lore entry (with an optional
 * subject-based audience scope) is visible to a speaking actor, based on the actor's
 * identity (race, profession traits, current location).
 *
 * Subject taxonomy and visibility rules: docs/spec/lore.md §3.
 *
 * - No `audience_scope` block                            → visible to everyone (default).
 * - `subject.kind === "world"`                           → visible to everyone.
 * - `subject.kind === "race"`                            → visible iff actor race matches.
 * - `subject.kind === "profession"`                      → visible iff actor has the profession.
 * - `subject.kind === "location"`                        → visible iff actor present at the bound
 *                                                           location (or ancestor, via callback).
 * - future/unknown subjects                              → hidden until a rule is defined.
 */
import { safeJsonParse, } from "../../utils";

/** Subject-based audience scope stored as JSON on a lore entry. */
export type LoreSubject =
  | { kind: "world" }
  | { kind: "location"; locationId?: string }
  | { kind: "profession"; profession: string }
  | { kind: "race"; race: string }
  | { kind: "faction" }
  | { kind: "item" };

export interface LoreScope {
  subject?: LoreSubject;
  /** Location lore is only known while the actor is present there. */
  requires_presence?: boolean;
}

/** Resolved identity of the speaking actor. */
export interface ActorIdentity {
  /** Resolved race from `character_permanent_traits` (trait_name='species'). Default 'human'. */
  race: string;
  /** Profession/class trait values + `professions.discipline` entries. */
  professions: string[];
  /** Current chat location id (may be null). */
  locationId: string | null;
}

/** Optional callback to test whether a location is inside another's scope tree. */
export type LocationInScope = (locId: string, scopeLocId: string,) => boolean;

/** Parse a stored audience_scope JSON string. Returns null for empty/invalid. */
export function parseLoreScope(json: string | null | undefined,): LoreScope | null {
  if (!json) { return null; }
  const result = safeJsonParse<Record<string, unknown>>(json,);
  if (!result.ok) { return null; }
  const value = result.value;
  if (!value || typeof value !== "object" || !("subject" in value)) {
    return null;
  }
  return value;
}

/**
 * Decide whether a lore entry is visible to a speaking actor.
 *
 * @param entry    The lore entry with parsed `audience_scope`.
 * @param identity The speaking actor's resolved identity.
 * @param locationInScope Optional resolver for location ancestry when subject.kind === "location".
 * @returns `true` if the actor may know this lore.
 */
export function isLoreVisibleTo(
  entry: { audienceScope?: LoreScope | null },
  identity: ActorIdentity,
  locationInScope?: LocationInScope,
): boolean {
  const scope = entry.audienceScope;
  const subject = scope?.subject;
  if (!subject) { return true; } // no restriction

  switch (subject.kind) {
    case "world": {
      return true;
    }
    case "race": {
      return subject.race
        ? identity.race.toLowerCase() === subject.race.toLowerCase()
        : false;
    }
    case "profession": {
      if (!subject.profession) { return false; }
      const target = subject.profession.toLowerCase();
      return identity.professions.some((p,) => p.toLowerCase() === target);
    }
    case "location": {
      const scopeLoc = subject.locationId;
      if (!scopeLoc) { return false; }
      // requires_presence=false: the actor holds this location's lore even when away
      // (standing knowledge). Presence is the default for location lore, so it is only
      // waived when explicitly set false.
      if (scope.requires_presence === false) { return true; }
      if (!identity.locationId) { return false; }
      return locationInScope
        ? locationInScope(identity.locationId, scopeLoc,)
        : identity.locationId === scopeLoc;
    }
    default: {
      // Unknown / not-yet-defined subject — close by default.
      return false;
    }
  }
}
