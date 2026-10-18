// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/routes/worlds/storage-route-support.ts — what every storage endpoint shares.
 *
 * The response schemas, the domain-code → HTTP mapping, the rejection
 * renderer, and the acting-actor derivation. Split from `./storage-routes` for
 * size. `requireActingActor` lives here rather than inline because it IS the
 * trust boundary: it is the ONE place a container request's identity comes
 * from, and a route that grew its own copy would be one refactor away from
 * trusting the request body again.
 */
import { t, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { StorageError, } from "../../worlds/storage";
import { resolvePrimaryActorId, } from "../actor-access";
import {
  extractAuth,
  HttpStatus,
  type HttpStatusCode,
  jsonError,
  jsonResponse,
  notFoundResponse,
} from "../http-utils";

export const StorageSummary = t.Object({
  id: t.String(),
  locationId: t.Union([t.String(), t.Null(),],),
  name: t.String(),
  capacity: t.Integer(),
  security: t.Integer(),
},);

export const StorageUsageBody = t.Object({ used: t.Integer(), capacity: t.Integer(), free: t.Integer(), },);

export const StorageContentBody = t.Object({ itemId: t.String(), quantity: t.Integer(), storedAt: t.String(), },);

// NO `actorId` FIELD, ON PURPOSE. The acting actor is the session user's
// persona (see `requireActingActor`); a body field here would let any world
// member name the owner and pass `checkStorageAccess` as them.
export const TransferBody = t.Object({
  itemId: t.String({ minLength: 1, },),
  quantity: t.Integer({ minimum: 1, },),
},);

/** Domain code → HTTP status. `capacity-exceeded` is a CONFLICT, not a 400: the
 * request was well formed, the container simply could not take it. */
export function storageStatus(code: StorageError["code"],): HttpStatusCode {
  if (code === "not-found") { return HttpStatus.NotFound; }
  if (code === "capacity-exceeded") { return HttpStatus.Conflict; }
  if (code === "access-denied") { return HttpStatus.Forbidden; }

  return HttpStatus.BadRequest;
}

/** Run a storage call, rendering its typed rejection through the envelope. */
export async function respond(action: () => Promise<unknown>,): Promise<Response> {
  try {
    return jsonResponse({ data: await action(), },);
  } catch (error) {
    if (error instanceof StorageError) {
      return jsonError({ message: error.message, status: storageStatus(error.code,), },);
    }

    throw error;
  }
}

/**
 * The actor a request acts AS, derived from the authenticated session.
 *
 * SECURITY: this is the trust boundary for every endpoint that touches a
 * container. `checkStorageAccess` compares the actor against the container's
 * `ownerActorId` / guest list, so an actor id taken from the request body is an
 * attacker-chosen value: any world member could post the owner's id and be
 * granted the owner's chest. World access proves MEMBERSHIP, not identity, so
 * it cannot stand in here. The identity comes from the session user's primary
 * persona — the same derivation `message-seen.ts` uses.
 * @param database Kysely handle
 * @param ctx the request context carrying the resolved `userId`
 * @returns the acting actor id, or a 404 Response when the user has no persona
 */
export async function requireActingActor(database: Kysely<DB>, ctx: unknown,): Promise<string | Response> {
  const { userId, } = extractAuth(ctx,);
  const actorId = userId ? await resolvePrimaryActorId(database, userId,) : null;

  return actorId ?? notFoundResponse("User actor",);
}
