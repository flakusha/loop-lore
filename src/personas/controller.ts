/**
 * Personas Controller
 *
 * Elysia plugin for persona CRUD operations.
 */
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import type { RequestContext, } from "../middleware/types";
import { ErrorCode, HttpStatus, jsonCreated, jsonError, jsonNoContent, jsonResponse, } from "../routes/http-utils";
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

// ── Elysia Plugin ─────────────────────────────────────────────────
export function personaRoutes({ database, }: { database: Kysely<DB> },) {
  return new Elysia({ name: "personas", },)
    .get("/api/personas", async (ctx,) => {
      const context: RequestContext = {
        userId: (ctx as any).userId as string | null,
        userRole: (ctx as any).userRole as string | null,
        sessionId: (ctx as any).sessionId as string | null,
      };
      return handleListPersonas({ database, context, },);
    },)
    .post("/api/personas", async (ctx,) => {
      const context: RequestContext = {
        userId: (ctx as any).userId as string | null,
        userRole: (ctx as any).userRole as string | null,
        sessionId: (ctx as any).sessionId as string | null,
      };
      const body = ctx.body as Record<string, unknown>;
      return handleCreatePersona({ database, body, context, },);
    },)
    .get("/api/personas/:id", async (ctx,) => {
      const context: RequestContext = {
        userId: (ctx as any).userId as string | null,
        userRole: (ctx as any).userRole as string | null,
        sessionId: (ctx as any).sessionId as string | null,
      };
      return handleGetPersona({ database, personaId: ctx.params.id, context, },);
    },)
    .patch("/api/personas/:id", async (ctx,) => {
      const context: RequestContext = {
        userId: (ctx as any).userId as string | null,
        userRole: (ctx as any).userRole as string | null,
        sessionId: (ctx as any).sessionId as string | null,
      };
      const body = ctx.body as Record<string, unknown>;
      return handleUpdatePersona({ database, personaId: ctx.params.id, body, context, },);
    },)
    .delete("/api/personas/:id", async (ctx,) => {
      const context: RequestContext = {
        userId: (ctx as any).userId as string | null,
        userRole: (ctx as any).userRole as string | null,
        sessionId: (ctx as any).sessionId as string | null,
      };
      return handleDeletePersona({ database, personaId: ctx.params.id, context, },);
    },)
    .post("/api/personas/:id/convert-to-character", async (ctx,) => {
      const context: RequestContext = {
        userId: (ctx as any).userId as string | null,
        userRole: (ctx as any).userRole as string | null,
        sessionId: (ctx as any).sessionId as string | null,
      };
      return handleConvertToCharacter({ database, personaId: ctx.params.id, context, },);
    },);
}

async function handleListPersonas({ database, context, }: ListPersonasOpts,): Promise<Response> {
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

async function handleCreatePersona({ database, body, context, }: CreatePersonaOpts,): Promise<Response> {
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
  },);

  return jsonCreated({ id: personaId, },);
}

async function handleGetPersona({ database, personaId, context, }: GetPersonaOpts,): Promise<Response> {
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

async function handleUpdatePersona({
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
    await service.update(
      personaId,
      {
        name: body.name as string | undefined,
        avatarAssetId: body.avatarAssetId as string | null | undefined,
        description: body.description as string | null | undefined,
        title: body.title as string | null | undefined,
        isDefault: body.isDefault as boolean | undefined,
      },
      userId,
    );
  } catch {
    return jsonError({ message: "Persona not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound, },);
  }

  return jsonResponse({ ok: true, },);
}

async function handleDeletePersona({ database, personaId, context, }: DeletePersonaOpts,): Promise<Response> {
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

async function handleConvertToCharacter({ database, personaId, context, }: GetPersonaOpts,): Promise<Response> {
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
