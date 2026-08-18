// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Persona handler functions extracted from controller.ts.
 */
import { ErrorCode, HttpStatus, jsonCreated, jsonError, jsonNoContent, jsonResponse, } from "../routes/http-utils";

import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
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
  } catch {
    return jsonError({ message: "Persona not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound, },);
  }

  return jsonResponse({ ok: true, },);
}

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
    return jsonError({
      message: error instanceof Error ? error.message : "Conversion failed",
      status: HttpStatus.NotFound,
    },);
  }
}
