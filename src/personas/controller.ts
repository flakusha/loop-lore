/**
 * Personas Controller
 *
 * HTTP handlers for persona CRUD operations.
 */
import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import type { RequestContext } from "../middleware/types";
import type { RouteDispatch } from "../routes/router";
import { registerRoute } from "../routes/router";
import { PersonasService } from "./service";
import {
  BAD_METHOD,
  jsonResponse,
  jsonError,
  jsonCreated,
  jsonNoContent,
  HttpStatus,
  ErrorCode,
  parseBody,
  extractIdFromPath,
} from "../routes/http-utils";

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

const dispatch: RouteDispatch = async ({ request, context, database }) => {
  const url = new URL(request.url);
  const { pathname } = url;
  const method = request.method;

  // ── /api/personas/:id/convert-to-character ───────────────────────
  const convertMatch = /^\/api\/personas\/([a-f0-9-]+)\/convert-to-character$/.exec(pathname);
  if (convertMatch) {
    if (method === "POST") {
      return handleConvertToCharacter({ database, personaId: convertMatch[1], context });
    }
    return BAD_METHOD();
  }

  // ── /api/personas/:id ───────────────────────────────────────────
  const personaId = extractIdFromPath(pathname, "/api/personas");
  if (personaId) {
    if (method === "GET") {
      return handleGetPersona({ database, personaId, context });
    }
    if (method === "PATCH") {
      const body = await parseBody(request);
      if (body instanceof Response) return body;
      return handleUpdatePersona({ database, personaId, body, context });
    }
    if (method === "DELETE") {
      return handleDeletePersona({ database, personaId, context });
    }
    return BAD_METHOD();
  }

  // ── /api/personas (collection) ───────────────────────────────────
  if (pathname === "/api/personas" && method === "GET") {
    return handleListPersonas({ database, context });
  }
  if (pathname === "/api/personas" && method === "POST") {
    const body = await parseBody(request);
    if (body instanceof Response) return body;
    return handleCreatePersona({ database, body, context });
  }

  return null;
};

async function handleListPersonas({ database, context }: ListPersonasOpts): Promise<Response> {
  const userId = context.userId;
  if (!userId) {
    return jsonError({
      message: "Unauthorized",
      status: HttpStatus.Unauthorized,
      code: ErrorCode.Unauthorized,
    });
  }

  const service = new PersonasService(database);
  const personas = await service.listByUser(userId);
  return jsonResponse(personas);
}

async function handleCreatePersona({ database, body, context }: CreatePersonaOpts): Promise<Response> {
  const userId = context.userId;
  if (!userId) {
    return jsonError({
      message: "Unauthorized",
      status: HttpStatus.Unauthorized,
      code: ErrorCode.Unauthorized,
    });
  }

  const name = body.name as string | undefined;
  if (!name || typeof name !== "string") {
    return jsonError({ message: "name is required", status: HttpStatus.BadRequest });
  }

  const service = new PersonasService(database);
  const personaId = await service.create({
    userId,
    name,
    avatarAssetId: body.avatarAssetId as string | null | undefined,
    description: body.description as string | null | undefined,
    title: body.title as string | null | undefined,
  });

  return jsonCreated({ id: personaId });
}

async function handleGetPersona({ database, personaId, context }: GetPersonaOpts): Promise<Response> {
  const userId = context.userId;
  if (!userId) {
    return jsonError({
      message: "Unauthorized",
      status: HttpStatus.Unauthorized,
      code: ErrorCode.Unauthorized,
    });
  }

  const service = new PersonasService(database);
  const persona = await service.getById(personaId, userId);
  if (!persona) {
    return jsonError({ message: "Persona not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound });
  }
  return jsonResponse(persona);
}

async function handleUpdatePersona({
  database,
  personaId,
  body,
  context,
}: UpdatePersonaOpts): Promise<Response> {
  const userId = context.userId;
  if (!userId) {
    return jsonError({
      message: "Unauthorized",
      status: HttpStatus.Unauthorized,
      code: ErrorCode.Unauthorized,
    });
  }

  const service = new PersonasService(database);
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
    return jsonError({ message: "Persona not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound });
  }

  return jsonResponse({ ok: true });
}

async function handleDeletePersona({ database, personaId, context }: DeletePersonaOpts): Promise<Response> {
  const userId = context.userId;
  if (!userId) {
    return jsonError({
      message: "Unauthorized",
      status: HttpStatus.Unauthorized,
      code: ErrorCode.Unauthorized,
    });
  }

  const service = new PersonasService(database);
  await service.delete(personaId, userId);
  return jsonNoContent();
}

async function handleConvertToCharacter({ database, personaId, context }: GetPersonaOpts): Promise<Response> {
  const userId = context.userId;
  if (!userId) {
    return jsonError({
      message: "Unauthorized",
      status: HttpStatus.Unauthorized,
      code: ErrorCode.Unauthorized,
    });
  }

  const service = new PersonasService(database);
  try {
    const result = await service.convertToCharacter(personaId, userId);
    return jsonCreated(result);
  } catch (error) {
    return jsonError({
      message: error instanceof Error ? error.message : "Conversion failed",
      status: HttpStatus.NotFound,
    });
  }
}

registerRoute(dispatch);
export { dispatch };
