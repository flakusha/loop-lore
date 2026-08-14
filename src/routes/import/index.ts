// src/routes/import.ts
//
// Character import routes.
// Handles import via multipart upload with auto-detection.
// Supports CHARX asset auto-import (avatars, audio, etc.).

import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { AuthConfig, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { authenticate, } from "../../middleware/auth";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { handleImport, } from "./handle";

export function importRoutes(
  { database, config, }: { database: Kysely<DB>; config: { auth: AuthConfig; assets?: { uploadDir?: string } } },
  prefix = "/api",
): Elysia {
  const uploadDir = config.assets?.uploadDir;

  return new Elysia({ name: "import", },).post(prefix + "/actors/import", async (ctx: any,) => {
    // authenticate directly before .derive()
    const authResult = await authenticate({ request: ctx.request, database, authConfig: config.auth, },);
    if (authResult instanceof Response) { return authResult; }
    return handleImport(ctx.request, database, authResult.context.userId!, uploadDir,);
  }, {
    response: {
      200: SuccessResponse,
      401: ErrorResponse,
    },
    detail: {
      summary: "Import a character",
      description:
        "Import a character card from a file upload. Supports CHARX, PNG, and JSON formats with auto-detection and asset import.",
      tags: ["Import",],
    },
  },) as unknown as Elysia;
}
