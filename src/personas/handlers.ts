// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Persona handler functions extracted from controller.ts.
 */
import { ErrorCode, HttpStatus, jsonCreated, jsonError, jsonNoContent, jsonResponse, } from "../routes/http-utils";

import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import type { RequestContext, } from "../middleware/types";
import { PersonasService, } from "./service";

interface ListPersonasOpts {
  database: Kysely<DB>;
  context: RequestContext;
}
interface CreatePersonaOpts {
  database: Kysely<DB>;
  context: RequestContext;
  body: Record<string, unknown>;
}
interface GetPersonaOpts {
  database: Kysely<DB>;
  context: RequestContext;
  personaId: string;
}
interface UpdatePersonaOpts {
  database: Kysely<DB>;
  context: RequestContext;
  personaId: string;
  body: Record<string, unknown>;
}
interface DeletePersonaOpts {
  database: Kysely<DB>;
  context: RequestContext;
  personaId: string;
}

/**
 * @param root0 - options
 * @param root0.database - Kysely DB handle
 * @param root0.context - request context (userId, sessionId, role)
 * @returns 200 JSON list of the user's personas, or 401 when unauthenticated.
 */
export async function handleListPersonas({ database, context, }: ListPersonasOpts,): Promise<Response> {
  const userId = context.userId;
  if (!userId) {
    return jsonError({
      message: "Unauthorized",
      status: HttpStatus.Unauthorized,
      code: ErrorCode.Unauthorized,
    },);
  }

  const service = new PersonasService(database,);
  const personas = await service.listByUser(userId,);
  return jsonResponse(personas,);
}

/**
 * @param root0 - options
 * @param root0.database - Kysely DB handle
 * @param root0.body - request body
 * @param root0.context - request context
 * @returns 201 with new persona id, or 400/401 on validation / auth failure.
 */
export async function handleCreatePersona({ database, body, context, }: CreatePersonaOpts,): Promise<Response> {
  const userId = context.userId;
  if (!userId) {
    return jsonError({
      message: "Unauthorized",
      status: HttpStatus.Unauthorized,
      code: ErrorCode.Unauthorized,
    },);
  }

  const name = body.name as string | undefined;
  if (!name || typeof name !== "string") {
    return jsonError({ message: "name is required", status: HttpStatus.BadRequest, },);
  }

  const service = new PersonasService(database,);
  const personaId = await service.create({
    userId,
    name,
    avatarAssetId: body.avatarAssetId as string | null | undefined,
    description: body.description as string | null | undefined,
    title: body.title as string | null | undefined,
    temperature: typeof body.temperature === "number" ? body.temperature : undefined,
    maxTokens: typeof body.maxTokens === "number" ? body.maxTokens : undefined,
    model: typeof body.model === "string" ? body.model : undefined,
  },);

  return jsonCreated({ id: personaId, },);
}

/**
 * @param root0 - options
 * @param root0.database - Kysely DB handle
 * @param root0.personaId - target persona id
 * @param root0.context - request context
 * @returns 200 with the persona JSON, or 401/404 on auth / not-found.
 */
export async function handleGetPersona({ database, personaId, context, }: GetPersonaOpts,): Promise<Response> {
  const userId = context.userId;
  if (!userId) {
    return jsonError({
      message: "Unauthorized",
      status: HttpStatus.Unauthorized,
      code: ErrorCode.Unauthorized,
    },);
  }

  const service = new PersonasService(database,);
  const persona = await service.getById(personaId, userId,);
  if (!persona) {
    return jsonError({ message: "Persona not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound, },);
  }
  return jsonResponse(persona,);
}

/**
 * @param root0 - options
 * @param root0.database - Kysely DB handle
 * @param root0.personaId - target persona id
 * @param root0.body - partial persona fields to update
 * @param root0.context - request context
 * @returns 200 with `{ ok: true }`, or 401/404 on auth / not-found.
 */
export async function handleUpdatePersona({
  database,
  personaId,
  body,
  context,
}: UpdatePersonaOpts,): Promise<Response> {
  const userId = context.userId;
  if (!userId) {
    return jsonError({
      message: "Unauthorized",
      status: HttpStatus.Unauthorized,
      code: ErrorCode.Unauthorized,
    },);
  }

  const service = new PersonasService(database,);
  try {
    const tuningUpdates: Record<string, unknown> = {};
    if ("temperature" in body) { tuningUpdates.temperature = body.temperature; }
    if ("maxTokens" in body) { tuningUpdates.maxTokens = body.maxTokens; }
    if ("model" in body) { tuningUpdates.model = body.model; }

    await service.update(
      personaId,
      {
        name: body.name as string | undefined,
        avatarAssetId: body.avatarAssetId as string | null | undefined,
        description: body.description as string | null | undefined,
        title: body.title as string | null | undefined,
        isDefault: body.isDefault as boolean | undefined,
        ...tuningUpdates,
      },
      userId,
    );
  } catch (error) {
    if (error instanceof Error && error.message === "Persona not found") {
      return jsonError({ message: "Persona not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound, },);
    }
    getLogger().error({
      msg: "Persona update failed",
      personaId,
      detail: error instanceof Error ? error.message : String(error,),
    },);
    return jsonError({
      message: "Failed to update persona",
      status: HttpStatus.InternalServerError,
      code: ErrorCode.ServerError,
    },);
  }

  return jsonResponse({ ok: true, },);
}

/**
 * @param root0 - options
 * @param root0.database - Kysely DB handle
 * @param root0.personaId - target persona id
 * @param root0.context - request context
 * @returns 204 No Content on success, or 401 on auth failure.
 */
export async function handleDeletePersona({ database, personaId, context, }: DeletePersonaOpts,): Promise<Response> {
  const userId = context.userId;
  if (!userId) {
    return jsonError({
      message: "Unauthorized",
      status: HttpStatus.Unauthorized,
      code: ErrorCode.Unauthorized,
    },);
  }

  const service = new PersonasService(database,);
  await service.delete(personaId, userId,);
  return jsonNoContent();
}

/**
 * @param root0 - options
 * @param root0.database - Kysely DB handle
 * @param root0.personaId - target persona id
 * @param root0.context - request context
 * @returns 201 with the new character id, or 401/404 on auth / not-found.
 */
export async function handleConvertToCharacter({ database, personaId, context, }: GetPersonaOpts,): Promise<Response> {
  const userId = context.userId;
  if (!userId) {
    return jsonError({
      message: "Unauthorized",
      status: HttpStatus.Unauthorized,
      code: ErrorCode.Unauthorized,
    },);
  }

  const service = new PersonasService(database,);
  try {
    const result = await service.convertToCharacter(personaId, userId,);
    return jsonCreated(result,);
  } catch (error) {
    if (error instanceof Error && error.message === "Persona not found") {
      return jsonError({ message: "Persona not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound, },);
    }
    getLogger().error({
      msg: "Persona conversion failed",
      personaId,
      detail: error instanceof Error ? error.message : String(error,),
    },);
    return jsonError({
      message: "Conversion failed",
      status: HttpStatus.InternalServerError,
      code: ErrorCode.ServerError,
    },);
  }
}
