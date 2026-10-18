// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/worlds/storage-access.ts — WHO may use a container.
 *
 * Split from `./storage` for size, and because the access decision is the one
 * piece here that is worth reading on its own: it is pure (no database, no
 * clock) and it returns a DISCRIMINATED RESULT, not a boolean.
 *
 * Why not a flag: a boolean flattens three genuinely different refusals — not
 * on the guest list, security level unmet, and calling from the wrong world —
 * into one `false`, and the caller then has to re-derive which happened from
 * the storage row. Every one of those has a different message a player should
 * see and a different thing worth logging.
 */
import type { Selectable, } from "kysely";
import { StorageAccessDenial, } from "../db/enums-story/resources";
import type { DB, } from "../db/schema";
import { jsonParseOr, jsonStringifyOr, } from "../utils";

/** One `location_storage` row as SELECT returns it. */
export type StorageRow = Selectable<DB["location_storage"]>;

/** The parsed `access_control` blob. Every field optional: an empty object
 * means an open container anyone in the world may use. */
export interface StorageAccessControl {
  /** The actor that owns the container. Always permitted. */
  ownerActorId?: string;
  /** Explicit guest list; consulted only when non-empty. */
  allowedActorIds?: string[];
  /** Minimum `security` the storage demands; defaults to no requirement. */
  requireSecurity?: number;
}

/** The verdict of an access check. */
export type StorageAccessResult =
  | { allowed: true }
  | { allowed: false; reason: StorageAccessDenial };

/** What the caller brings to an access check. */
export interface StorageAccessRequest {
  /** The container being accessed. */
  storage: StorageRow;
  /** The actor attempting access. */
  actorId: string;
  /** The world the caller believes they are acting in. */
  worldId: string;
}

/**
 * Read and normalize the JSON access-control blob.
 *
 * A malformed blob parses to `{}` — an unreadable rule is treated as no rule
 * rather than as "deny everything", because a container whose access_control
 * got corrupted should degrade to an open chest, not to a permanently jammed
 * one that no caller can diagnose. Unknown keys are dropped so a stale field
 * cannot silently widen or narrow access.
 * @param storage the container row
 * @returns the normalized rules, possibly empty
 */
export function readAccessControl(storage: StorageRow,): StorageAccessControl {
  const parsed = jsonParseOr<StorageAccessControl>(storage.access_control, {},);

  return {
    ...(typeof parsed.ownerActorId === "string" ? { ownerActorId: parsed.ownerActorId, } : {}),
    ...(Array.isArray(parsed.allowedActorIds,) ? { allowedActorIds: parsed.allowedActorIds, } : {}),
    ...(typeof parsed.requireSecurity === "number" ? { requireSecurity: parsed.requireSecurity, } : {}),
  };
}

/**
 * Decide whether an actor may use a container.
 *
 * Order matters: the cross-world check runs FIRST, so a caller acting in the
 * wrong world is told "cross-world" rather than "not on the guest list" — the
 * latter would confirm that a container exists in a world they cannot see.
 *
 * The owner always passes. A guest list is REQUIRED once an owner is set: an
 * owner-scoped chest admits only its owner plus the actors named on the list, so
 * claiming a chest must not silently turn it into public property. `requireSecurity`
 * is a floor on the CONTAINER's own `security` — below it the chest is too
 * insecure to trust with a guest's hands, and only the owner may open it.
 * @param request the container, the actor, and the caller's world
 * @returns `{ allowed: true }`, or `{ allowed: false, reason }` naming why
 */
export function checkStorageAccess(request: StorageAccessRequest,): StorageAccessResult {
  const { storage, actorId, worldId, } = request;

  if (storage.world_id !== worldId) {
    return { allowed: false, reason: StorageAccessDenial.CrossWorld, };
  }

  const rules = readAccessControl(storage,);
  if (rules.ownerActorId === actorId) { return { allowed: true, }; }

  // An unowned container is public to its world; an owned one is not.
  if (rules.ownerActorId === undefined) { return { allowed: true, }; }

  const guests = rules.allowedActorIds ?? [];
  if (!guests.includes(actorId,)) {
    return { allowed: false, reason: StorageAccessDenial.NotAllowed, };
  }

  if (rules.requireSecurity !== undefined && rules.requireSecurity > storage.security) {
    return { allowed: false, reason: StorageAccessDenial.SecurityTooLow, };
  }

  return { allowed: true, };
}

/** Raised for every storage rejection, so callers can branch on `code` rather
 * than string-matching a message. */
export class StorageError extends Error {
  /**
   * @param code machine-readable reason
   * @param message human-readable detail
   */
  constructor(
    public readonly code:
      | "not-found"
      | "capacity-exceeded"
      | "access-denied"
      | "insufficient-quantity"
      | "invalid-quantity",
    message: string,
  ) {
    super(message,);
    this.name = "StorageError";
  }
}

/** Serialize an access-control object for the `access_control` column. */
export function encodeAccessControl(rules: StorageAccessControl,): string {
  return jsonStringifyOr(rules, "{}",);
}

/**
 * Enforce the access rules on a container a caller has already loaded.
 *
 * Every read AND every write on a container goes through this, so an authz
 * decision can never be quietly skipped at a call site — an unreadable
 * contents route is exactly the hole this exists to close. `actorId` MUST be
 * the AUTHENTICATED actor: a body-supplied id makes this check theatre.
 * @param storage the loaded container row
 * @param actorId the authenticated actor acting on the container
 * @param worldId the world the caller is acting in
 * @throws {StorageError} `access-denied` when the actor may not use the container
 */
export function assertMayAccess(storage: StorageRow, actorId: string, worldId: string,): void {
  const verdict = checkStorageAccess({ storage, actorId, worldId, },);
  if (!verdict.allowed) {
    throw new StorageError(
      "access-denied",
      `actor "${actorId}" may not use storage "${storage.id}" (${verdict.reason})`,
    );
  }
}
