// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared wiring for the faction routes and their karma siblings
 * (./faction-routes, ./karma-routes).
 *
 * Factions are addressed by their own id in the path and in the pair bodies,
 * while the world gate only authorizes `:worldId` — so every faction-touching
 * endpoint needs the same world-scope check, wire schemas and error mapping.
 * They live here rather than being re-derived per plugin.
 */
import { t, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { notFound, } from "../../validation/middleware";
import { ErrorResponse, } from "../../validation/schemas";
import type { FactionRelationship, } from "../../worlds/factions";
import { FactionError, } from "../../worlds/factions";
import type { DiplomaticActionOptions, } from "../../worlds/factions-diplomacy";
import { breakAlliance, declareWar, formAlliance, proposePeace, } from "../../worlds/factions-diplomacy";
import { extractAuth, HttpStatus, jsonError, jsonResponse, } from "../http-utils";
import { requireWorldOwner, } from "./access";

/** Pair body shared by every relationship endpoint. */
export const PairBody = t.Object({
  factionA: t.String({ minLength: 1, },),
  factionB: t.String({ minLength: 1, },),
  reason: t.Optional(t.String({ maxLength: 2000, },),),
},);

/** Success envelope shared by the read and diplomacy endpoints. */
export const DataResponse = { 200: t.Object({ data: t.Any(), },), };
/** Error statuses the access guards and service can produce. */
export const Errors = { 400: ErrorResponse, 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse, };

/** One diplomatic verb mounted at its own path. */
export interface DiplomacyRoute {
  path: string;
  summary: string;
  description: string;
  verb: (options: DiplomaticActionOptions,) => Promise<FactionRelationship>;
}

/** The diplomatic verbs and where each is mounted. */
export const DIPLOMACY_ROUTES: readonly DiplomacyRoute[] = [
  { path: "war", summary: "Declare war", description: "Move a pair to at_war.", verb: declareWar, },
  { path: "peace", summary: "Propose peace", description: "End a war.", verb: proposePeace, },
  { path: "alliance", summary: "Form alliance", description: "Two factions sign a pact.", verb: formAlliance, },
  { path: "alliance/break", summary: "Break alliance", description: "An allied pair betrays.", verb: breakAlliance, },
];

/**
 * @param error thrown service error
 * @throws FactionError
 * @returns mapped HTTP response; 404 for a missing faction, 400 otherwise
 */
export function factionErrorResponse(error: unknown,): Response {
  if (error instanceof FactionError) {
    const status = error.code === "not-found" ? HttpStatus.NotFound : HttpStatus.BadRequest;
    return jsonError({ message: error.message, status, },);
  }

  throw error;
}

/**
 * @param database Kysely handle
 * @param ctx Elysia context (auth, world id, and the pair body)
 * @param verb the diplomatic action to apply behind the world-owner guard
 */
export async function runDiplomacy(
  database: Kysely<DB>,
  ctx: any,
  verb: DiplomacyRoute["verb"],
): Promise<Response> {
  const { userId, userRole, } = extractAuth(ctx,);
  const worldErr = await requireWorldOwner(database, ctx.params.worldId, userId, userRole,);
  if (worldErr) { return worldErr; }

  const factionErr = await requireFactionsInWorld(database, ctx.params.worldId, [
    ctx.body.factionA,
    ctx.body.factionB,
  ],);

  if (factionErr) { return factionErr; }

  try {
    const relationship = await verb({
      db: database,
      factionA: ctx.body.factionA,
      factionB: ctx.body.factionB,
      reason: ctx.body.reason,
    },);

    return jsonResponse({ data: relationship, },);
  } catch (e) {
    return factionErrorResponse(e,);
  }
}

/**
 * The world gate authorizes `:worldId`, but factions are addressed by their own
 * id in the path and in the pair bodies: without this scope check a caller who
 * owns ANY world could read or rewrite another world's factions.
 * @param database Kysely handle
 * @param worldId world the caller was authorized for
 * @param factionIds faction ids the request addresses
 * @returns 404 when any id is missing or belongs to another world, else null
 */
export async function requireFactionsInWorld(
  database: Kysely<DB>,
  worldId: string,
  factionIds: readonly string[],
): Promise<Response | null> {
  const found = await database
    .selectFrom("factions",)
    .select("id",)
    .where("id", "in", [...factionIds,],)
    .where("world_id", "=", worldId,)
    .execute();

  return found.length === new Set(factionIds,).size ? null : notFound("Faction not found",);
}
