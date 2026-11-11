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
import type { PrincipalKind, } from "../middleware/types";
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
/**
 * Build the Elysia route plugin for persona CRUD.
 * @param root0 - plugin config
 * @param root0.database - Kysely DB handle
 * @param prefix
 * @returns `Elysia` instance wired to the persona routes.
 */
export function personaRoutes({ database, }: { database: Kysely<DB> }, prefix = "/api",) {
  return new Elysia({ name: "personas", },)
    .get(`${prefix}/personas`, async (ctx,) => {
      const context = createRequestContext({
        userId: (ctx as any).userId as string | null,
        userRole: (ctx as any).userRole as string | null,
        sessionId: (ctx as any).sessionId as string | null,
        // Pass-through of the derive's resolved kind (required on every
        // context — no default-principal fallback).
        principalKind: (ctx as any).principalKind as PrincipalKind,
      },);

      return handleListPersonas({ database, context, },);
    },)
    .post(`${prefix}/personas`, async (ctx,) => {
      const context = createRequestContext({
        userId: (ctx as any).userId as string | null,
        userRole: (ctx as any).userRole as string | null,
        sessionId: (ctx as any).sessionId as string | null,
        // Pass-through of the derive's resolved kind (required on every
        // context — no default-principal fallback).
        principalKind: (ctx as any).principalKind as PrincipalKind,
      },);

      const body = ctx.body as Record<string, unknown>;
      return handleCreatePersona({ database, body, context, },);
    },)
    .get(`${prefix}/personas/:id`, async (ctx,) => {
      const context = createRequestContext({
        userId: (ctx as any).userId as string | null,
        userRole: (ctx as any).userRole as string | null,
        sessionId: (ctx as any).sessionId as string | null,
        // Pass-through of the derive's resolved kind (required on every
        // context — no default-principal fallback).
        principalKind: (ctx as any).principalKind as PrincipalKind,
      },);

      return handleGetPersona({ database, personaId: ctx.params.id, context, },);
    },)
    .patch(`${prefix}/personas/:id`, async (ctx,) => {
      const context = createRequestContext({
        userId: (ctx as any).userId as string | null,
        userRole: (ctx as any).userRole as string | null,
        sessionId: (ctx as any).sessionId as string | null,
        // Pass-through of the derive's resolved kind (required on every
        // context — no default-principal fallback).
        principalKind: (ctx as any).principalKind as PrincipalKind,
      },);

      const body = ctx.body as Record<string, unknown>;
      return handleUpdatePersona({ database, personaId: ctx.params.id, body, context, },);
    },)
    .delete(`${prefix}/personas/:id`, async (ctx,) => {
      const context = createRequestContext({
        userId: (ctx as any).userId as string | null,
        userRole: (ctx as any).userRole as string | null,
        sessionId: (ctx as any).sessionId as string | null,
        // Pass-through of the derive's resolved kind (required on every
        // context — no default-principal fallback).
        principalKind: (ctx as any).principalKind as PrincipalKind,
      },);

      return handleDeletePersona({ database, personaId: ctx.params.id, context, },);
    },)
    .post(`${prefix}/personas/:id/convert-to-character`, async (ctx,) => {
      const context = createRequestContext({
        userId: (ctx as any).userId as string | null,
        userRole: (ctx as any).userRole as string | null,
        sessionId: (ctx as any).sessionId as string | null,
        // Pass-through of the derive's resolved kind (required on every
        // context — no default-principal fallback).
        principalKind: (ctx as any).principalKind as PrincipalKind,
      },);

      return handleConvertToCharacter({ database, personaId: ctx.params.id, context, },);
    },);
}
