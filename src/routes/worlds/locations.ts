// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 264

import type { Kysely, } from "kysely";
import { PublicationStatus, } from "../../db/enums-story";
import { LOCATION_DEPTH_LIMIT, } from "../../db/enums-story/world";
import type { DB, } from "../../db/schema";
import { LocationTreeService, } from "../../locations";
import { getLogger, } from "../../logger";
import { safeJsonStringify, uid, } from "../../utils";
import { notFound, } from "../../validation/middleware";
import {
  HttpStatus,
  jsonCreated,
  jsonError,
  jsonPaginated,
  jsonResponse,
} from "../http-utils";
import { requireWorldAccess, requireWorldOwner, } from "./access";
import { createLocationChat, resolveLocationTemplate, } from "./location-chat";
import { validateConnections, } from "./location-connections";
import { reparentLocation, } from "./locations-reparent";

/**
 * @param database
 * @param worldId
 * @param page
 * @param pageSize
 * @param userId
 * @param userRole
 * @param q
 * @returns {Promise<Response>}
 */
export async function handleListLocations(
  database: Kysely<DB>,
  worldId: string,
  page: number,
  pageSize: number,
  userId: string | null,
  userRole: string | null,
  q?: string,
) {
  // Read-only route: the synthetic guest tier (auth.guestAccess) may read
  // the locations of a PUBLIC world here — and only here.
  const worldErr = await requireWorldAccess(database, worldId, userId, userRole, { allowGuest: true, },);
  if (worldErr) { return worldErr; }

  const offset = (page - 1) * pageSize;
  let countQuery = database
    .selectFrom("locations",)
    .select(database.fn.countAll<number>().as("total",),)
    .where("world_id", "=", worldId,);

  let listQuery = database
    .selectFrom("locations",)
    .selectAll()
    .where("world_id", "=", worldId,);

  const trimmedQ = q?.trim() ?? "";
  if (trimmedQ) {
    const like = `%${trimmedQ}%`;
    countQuery = countQuery.where("name", "like", like,);
    listQuery = listQuery.where("name", "like", like,);
  }

  const countResult = await countQuery.executeTakeFirst();
  const total = countResult?.total ?? 0;

  const locations = await listQuery
    .orderBy("name", "asc",)
    .limit(pageSize,)
    .offset(offset,)
    .execute();

  return jsonPaginated({ data: locations, total, page, pageSize, },);
}

/**
 * @param database
 * @param worldId
 * @param body
 * @param userId
 * @param userRole
 * @returns {Promise<Response>}
 */
export async function handleCreateLocation(
  database: Kysely<DB>,
  worldId: string,
  body: Record<string, unknown>,
  userId: string | null,
  userRole: string | null,
) {
  const worldErr = await requireWorldOwner(database, worldId, userId, userRole,);
  if (worldErr) { return worldErr; }

  const name = body.name as string | undefined;
  if (!name) { return jsonError({ message: "name is required", status: HttpStatus.BadRequest, },); }

  // The id is generated up front so `connections` can be validated against the
  // new row's own id: a payload naming its own id is a self-link and must be
  // rejected 400 exactly like on the update path.
  const id = uid();

  const parentErr = await validateParentForCreate(database, worldId, body.parentLocationId,);
  if (parentErr) { return parentErr; }

  if (body.connections) {
    const connError = await validateConnections(database, worldId, body.connections, id,);
    if (connError) { return connError; }
  }

  // Resolve the template BEFORE opening the transaction — bun:sqlite is
  // single-connection, so a query on `database` inside the tx would deadlock.
  const template = await resolveLocationTemplate(database, body,);
  if (!template) {
    return jsonError({ message: "Chat setup template not found", status: HttpStatus.BadRequest, },);
  }

  try {
    await database.transaction().execute(async (tx,) => {
      await tx
        .insertInto("locations",)
        .values({
          id,
          world_id: worldId,
          name,
          description: (body.description as string | undefined) ?? null,
          publication_status: PublicationStatus.Draft,
          parent_location_id: (body.parentLocationId as string | undefined) ?? null,
          connections: body.connections
            ? (() => {
              const r = safeJsonStringify(body.connections,);
              return r.ok ? r.value : "[]";
            })()
            : "[]",
          kind: ((body.kind as string | undefined) ?? "region") as never,
          mobility_mode: ((body.mobilityMode as string | undefined) ?? "static") as never,
          coord_x: (body.coordX as number | undefined) ?? null,
          coord_y: (body.coordY as number | undefined) ?? null,
          coord_z: (body.coordZ as number | undefined) ?? null,
        } as never,)
        .execute();

      await createLocationChat(tx, {
        locationId: id,
        worldId,
        name,
        body,
        fallbackUserId: userId,
      }, template,);
    },);
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error,),);
    getLogger().error(
      "Location creation failed",
      failure,
      { worldId, locationId: id, },
    );

    return jsonError({
      message: "Failed to create location with its public chat",
      status: HttpStatus.InternalServerError,
    },);
  }

  return jsonCreated({ id, },);
}

/**
 * @param database
 * @param worldId
 * @param locId
 * @param userId
 * @param userRole
 * @returns {Promise<Response>}
 */
export async function handleGetLocation(
  database: Kysely<DB>,
  worldId: string,
  locId: string,
  userId: string | null,
  userRole: string | null,
) {
  // Read-only route: the synthetic guest tier (auth.guestAccess) may read a
  // location of a PUBLIC world here — and only here.
  const worldErr = await requireWorldAccess(database, worldId, userId, userRole, { allowGuest: true, },);
  if (worldErr) { return worldErr; }

  const location = await database
    .selectFrom("locations",)
    .selectAll()
    .where("id", "=", locId,)
    .where("world_id", "=", worldId,)
    .executeTakeFirst();

  if (!location) { return notFound("Location not found",); }
  return jsonResponse(location,);
}

/**
 * @param database
 * @param worldId
 * @param locId
 * @param body
 * @param userId
 * @param userRole
 * @returns {Promise<Response>}
 */
export async function handleUpdateLocation(
  database: Kysely<DB>,
  worldId: string,
  locId: string,
  body: Record<string, unknown>,
  userId: string | null,
  userRole: string | null,
) {
  const worldErr = await requireWorldOwner(database, worldId, userId, userRole,);
  if (worldErr) { return worldErr; }

  const updates: Record<string, unknown> = {};
  if (body.name) { updates.name = body.name; }
  if (body.description) { updates.description = body.description; }
  const parentId = typeof body.parentLocationId === "string" ? body.parentLocationId : "";
  if (parentId) {
    const reparentErr = await reparentLocation(database, worldId, locId, parentId,);
    if (reparentErr) { return reparentErr; }
  }

  if (body.kind != null) { updates.kind = body.kind; }
  if (body.mobilityMode != null) { updates.mobility_mode = body.mobilityMode; }
  // Client-supplied `path` is never written: the path column is owned by the
  // DB triggers + LocationTreeService.repairPath, and trusting it would let a
  // forged value desync the materialized tree.
  if (body.coordX !== undefined) { updates.coord_x = body.coordX; }
  if (body.coordY !== undefined) { updates.coord_y = body.coordY; }
  if (body.coordZ !== undefined) { updates.coord_z = body.coordZ; }
  if (body.connections) {
    const connError = await validateConnections(database, worldId, body.connections, locId,);
    if (connError) { return connError; }

    const connectionsResult = safeJsonStringify(body.connections,);
    if (!connectionsResult.ok) {
      return jsonError({ message: "Invalid connections data", status: HttpStatus.BadRequest, },);
    }

    updates.connections = connectionsResult.value;
  }

  updates.updated_at = new Date().toISOString();

  await database
    .updateTable("locations",)
    .set(updates,)
    .where("id", "=", locId,)
    .where("world_id", "=", worldId,)
    .execute();

  return jsonResponse({ ok: true, },);
}

/**
 * Depth/parent validation for HTTP creates, mirroring the app-layer checks in
 * LocationTreeService.insertLocation: the parent must exist in the same world
 * and the child must not exceed LOCATION_DEPTH_LIMIT. Without this the depth
 * ceiling only bound service callers — HTTP creates could nest arbitrarily
 * deep.
 * @param database
 * @param worldId
 * @param parentLocationId
 * @returns error Response, or null when the parent is acceptable
 */
async function validateParentForCreate(
  database: Kysely<DB>,
  worldId: string,
  parentLocationId: unknown,
): Promise<Response | null> {
  if (typeof parentLocationId !== "string" || parentLocationId === "") { return null; }

  const parent = await database
    .selectFrom("locations",)
    .where("id", "=", parentLocationId,)
    .select(["id", "world_id", "path",],)
    .executeTakeFirst();

  if (!parent) {
    return jsonError({ message: "Parent location not found", status: HttpStatus.BadRequest, },);
  }

  if (parent.world_id !== worldId) {
    return jsonError({ message: "Parent location belongs to another world", status: HttpStatus.BadRequest, },);
  }

  if (LocationTreeService.depth(parent.path,) + 1 > LOCATION_DEPTH_LIMIT) {
    return jsonError({
      message: `location depth exceeds limit (${LOCATION_DEPTH_LIMIT})`,
      status: HttpStatus.BadRequest,
    },);
  }

  return null;
}
