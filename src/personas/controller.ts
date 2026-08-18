// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Personas Controller
 *
 * Elysia plugin for persona CRUD operations.
 */
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createRequestContext, } from "../middleware/types";
import {
  handleConvertToCharacter,
  handleCreatePersona,
  handleDeletePersona,
  handleGetPersona,
  handleListPersonas,
  handleUpdatePersona,
} from "./handlers";

// ── Elysia Plugin ─────────────────────────────────────────────────
export function personaRoutes({ database, }: { database: Kysely<DB> },) {
  return new Elysia({ name: "personas", },)
    .get("/api/personas", async (ctx,) => {
      const context = createRequestContext({
        userId: (ctx as any).userId as string | null,
        userRole: (ctx as any).userRole as string | null,
        sessionId: (ctx as any).sessionId as string | null,
      },);
      return handleListPersonas({ database, context, },);
    },)
    .post("/api/personas", async (ctx,) => {
      const context = createRequestContext({
        userId: (ctx as any).userId as string | null,
        userRole: (ctx as any).userRole as string | null,
        sessionId: (ctx as any).sessionId as string | null,
      },);
      const body = ctx.body as Record<string, unknown>;
      return handleCreatePersona({ database, body, context, },);
    },)
    .get("/api/personas/:id", async (ctx,) => {
      const context = createRequestContext({
        userId: (ctx as any).userId as string | null,
        userRole: (ctx as any).userRole as string | null,
        sessionId: (ctx as any).sessionId as string | null,
      },);
      return handleGetPersona({ database, personaId: ctx.params.id, context, },);
    },)
    .patch("/api/personas/:id", async (ctx,) => {
      const context = createRequestContext({
        userId: (ctx as any).userId as string | null,
        userRole: (ctx as any).userRole as string | null,
        sessionId: (ctx as any).sessionId as string | null,
      },);
      const body = ctx.body as Record<string, unknown>;
      return handleUpdatePersona({ database, personaId: ctx.params.id, body, context, },);
    },)
    .delete("/api/personas/:id", async (ctx,) => {
      const context = createRequestContext({
        userId: (ctx as any).userId as string | null,
        userRole: (ctx as any).userRole as string | null,
        sessionId: (ctx as any).sessionId as string | null,
      },);
      return handleDeletePersona({ database, personaId: ctx.params.id, context, },);
    },)
    .post("/api/personas/:id/convert-to-character", async (ctx,) => {
      const context = createRequestContext({
        userId: (ctx as any).userId as string | null,
        userRole: (ctx as any).userRole as string | null,
        sessionId: (ctx as any).sessionId as string | null,
      },);
      return handleConvertToCharacter({ database, personaId: ctx.params.id, context, },);
    },);
}
