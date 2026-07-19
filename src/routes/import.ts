// src/routes/import.ts
//
// Character import routes.
// Handles import via multipart upload with auto-detection.

import { Elysia } from "elysia";
import crypto from "node:crypto";
import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import { uid, safeJsonStringify } from "../utils";
import { jsonError, jsonCreated, HttpStatus } from "./http-utils";
import { parseCharacterCard, validateCharacter } from "../characters/parser";
import type { CanonicalCharacter } from "../characters/parser";
import { getOrCreateSoloUserForAuth } from "../middleware/auth";

interface ImportActorOpts {
  character: CanonicalCharacter;
  format: string;
  warnings: string[];
  database: Kysely<DB>;
  userId: string;
}

async function importActor(opts: ImportActorOpts): Promise<Response> {
  const { character, format, warnings, database, userId } = opts;

  // Validate character
  const validationErrors = validateCharacter(character);
  if (validationErrors.length > 0) {
    return jsonError({
      message: `Validation failed: ${validationErrors.join(", ")}`,
      status: HttpStatus.BadRequest,
    });
  }

  const id = uid();

  // Convert alternate_greetings to JSON string
  let alternateGreetings: string | null = null;
  if (character.alternate_greetings && character.alternate_greetings.length > 0) {
    const result = safeJsonStringify(character.alternate_greetings);
    if (result.ok) alternateGreetings = result.value;
  }

  // Insert character as actor
  await database
    .insertInto("actors")
    .values({
      id,
      actor_type: "character",
      display_name: character.name,
      user_id: userId,
      owner_id: userId,
      agent_type: "ai",
      description: character.description,
      system_prompt: character.system_prompt ?? null,
      welcome_message: character.welcome_message ?? null,
      personality: character.personality ?? null,
      scenario: character.scenario ?? null,
      mes_example: character.mes_example ?? null,
      post_history_instructions: character.post_history_instructions ?? null,
      creator_notes: character.creator_notes ?? null,
      creator: character.creator ?? null,
      character_version: character.character_version ?? null,
      import_spec: format,
      alternate_greetings: alternateGreetings,
      settings: "{}",
      data_version: 1,
    })
    .execute();

  return jsonCreated({
    id,
    name: character.name,
    format,
    warnings,
  });
}

async function resolveUserId(request: Request, database: Kysely<DB>): Promise<string | null> {
  const cookieHeader = request.headers.get("Cookie");
  const match = cookieHeader ? /ll_token=([^;]+)/.exec(cookieHeader) : null;
  if (match) {
    const tokenHash = crypto.createHash("sha256").update(match[1]!).digest("hex");
    const session = await database
      .selectFrom("sessions")
      .select(["user_id"])
      .where("token_hash", "=", tokenHash)
      .executeTakeFirst();
    if (session) return session.user_id;
  }
  // Fallback to solo user
  const solo = await getOrCreateSoloUserForAuth(database, "solo");
  return solo?.id ?? null;
}

async function handleImport(request: Request, database: Kysely<DB>, userId: string): Promise<Response> {
  if (!userId) return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized });

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File))
      return jsonError({ message: "file field is required", status: HttpStatus.BadRequest });

    const fileBytes = Buffer.from(await file.arrayBuffer());
    const filename = file.name ?? "";

    try {
      // Parse character card with auto-detection
      const result = await parseCharacterCard(fileBytes, filename);

      // Import the character
      return await importActor({
        character: result.character,
        format: result.format,
        warnings: result.warnings,
        database,
        userId,
      });
    } catch (error) {
      const parseError = error as { code?: string; message?: string; suggestion?: string };
      return jsonError({
        message: parseError.message ?? "Failed to parse character card",
        status: HttpStatus.BadRequest,
      });
    }
  }

  return jsonError({ message: "Expected multipart/form-data", status: HttpStatus.BadRequest });
}

export function importRoutes({ database }: { database: Kysely<DB> }): Elysia {
  return new Elysia({ name: "import" }).onRequest(async (ctx: any) => {
    const url = new URL(ctx.request.url);
    if (ctx.request.method === "POST" && url.pathname === "/api/actors/import") {
      const userId = await resolveUserId(ctx.request, database);
      return handleImport(ctx.request, database, userId ?? "");
    }
  }) as unknown as Elysia;
}
