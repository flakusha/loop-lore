/**
 * Key Management Routes
 *
 * Per-user encryption key management:
 *   GET    /api/keys           — list actor keys
 *   POST   /api/keys           — generate new named key
 *   POST   /api/keys/rotate    — rotate primary key
 *   DELETE /api/keys/:id       — revoke key (irreversible)
 *
 * Elysia plugin — uses auth guard for authentication.
 */

import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import {
  generateActorKey,
  getSmk,
  listActorKeys,
  revokeActorKey,
  rotateActorKey,
} from "../crypto";
import type { DB, } from "../db/schema";
import { getLogger, type Logger, } from "../logger";
import { notFound, unauthorized, } from "../validation/middleware";
import { ErrorResponse, SuccessResponse, } from "../validation/schemas";
import { HttpStatus, jsonError, jsonResponse, } from "./http-utils";

function log(): Logger {
  return getLogger().child({ module: "key-management", },);
}

export function keyManagementRoutes({ database, }: { database: Kysely<DB> },) {
  return new Elysia({ name: "key-management", },)
    // ── List actor keys ────────────────────────────────────────
    .get("/api/keys", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return unauthorized(ctx.t?.("errors.unauthorized",) ?? "Unauthorized",); }

      try {
        const keys = await listActorKeys(database, userId,);
        return jsonResponse({ keys, },);
      } catch (error) {
        log().error(`Failed to list keys for actor ${userId}: ${String(error,)}`,);
        return jsonError({
          message: ctx.t?.("crypto.keyListFailed",) ?? "Failed to list keys",
          status: HttpStatus.InternalServerError,
        },);
      }
    }, {
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
      },
      detail: {
        summary: "List actor encryption keys",
        description: "Returns all encryption keys for the authenticated user.",
        tags: ["Admin", "Keys",],
      },
    },)
    // ── Generate new named key ─────────────────────────────────
    .post(
      "/api/keys",
      async (ctx: any,) => {
        const userId = ctx.userId as string | null;
        if (!userId) { return unauthorized(ctx.t?.("errors.unauthorized",) ?? "Unauthorized",); }

        const body = ctx.body as { name: string };
        if (!body.name || typeof body.name !== "string" || body.name.trim().length === 0) {
          return jsonError({
            message: ctx.t?.("crypto.keyNameRequired",) ?? "Key name is required",
            status: HttpStatus.BadRequest,
          },);
        }

        try {
          const smk = getSmk();
          if (!smk) {
            return jsonError({
              message: ctx.t?.("crypto.encryptionNotConfigured",) ?? "Encryption not configured",
              status: HttpStatus.InternalServerError,
            },);
          }

          const keyId = await generateActorKey({
            database,
            actorId: userId,
            name: body.name.trim(),
            smk,
          },);

          log().info("Generated new key", { actorId: userId, name: body.name.trim(), keyId, },);

          return jsonResponse({
            id: keyId,
            name: body.name.trim(),
            status: "active",
          },);
        } catch (error) {
          log().error(`Failed to generate key for actor ${userId}: ${String(error,)}`,);
          return jsonError({
            message: ctx.t?.("crypto.keyGenerateFailed",) ?? "Failed to generate key",
            status: HttpStatus.InternalServerError,
          },);
        }
      },
      {
        body: t.Object({ name: t.String(), },),
        response: {
          200: SuccessResponse,
          401: ErrorResponse,
        },
        detail: {
          summary: "Generate a new named encryption key",
          description: "Creates a new encryption key with the given name for the authenticated user.",
          tags: ["Admin", "Keys",],
        },
      },
    )
    // ── Rotate primary key ─────────────────────────────────────
    .post("/api/keys/rotate", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return unauthorized(ctx.t?.("errors.unauthorized",) ?? "Unauthorized",); }

      try {
        const smk = getSmk();
        if (!smk) {
          return jsonError({
            message: ctx.t?.("crypto.encryptionNotConfigured",) ?? "Encryption not configured",
            status: HttpStatus.InternalServerError,
          },);
        }

        const newKeyId = await rotateActorKey({
          database,
          actorId: userId,
          smk,
        },);

        log().info("Rotated primary key", { actorId: userId, newKeyId, },);

        return jsonResponse({
          id: newKeyId,
          status: "active",
          message: "Primary key rotated. Old key marked as expired.",
        },);
      } catch (error) {
        log().error(`Failed to rotate key for actor ${userId}: ${String(error,)}`,);
        return jsonError({
          message: "Failed to rotate key",
          status: HttpStatus.InternalServerError,
        },);
      }
    }, {
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
      },
      detail: {
        summary: "Rotate the primary encryption key",
        description:
          "Generates a new primary key and marks the old one as expired. Previous keys cannot be used for new encryptions.",
        tags: ["Admin", "Keys",],
      },
    },)
    // ── Revoke key (irreversible) ──────────────────────────────
    .delete(
      "/api/keys/:id",
      async (ctx: any,) => {
        const userId = ctx.userId as string | null;
        if (!userId) { return unauthorized(ctx.t?.("errors.unauthorized",) ?? "Unauthorized",); }

        const keyId = (ctx.params as { id: string }).id;

        // Verify key belongs to this actor
        const keys = await listActorKeys(database, userId,);
        const existingKey = keys.find((k,) => k.id === keyId);
        if (!existingKey) {
          return notFound("Key not found",);
        }

        if (existingKey.status === "revoked") {
          return jsonError({
            message: "Key is already revoked",
            status: HttpStatus.BadRequest,
          },);
        }

        try {
          await revokeActorKey(database, keyId,);

          log().warn("Revoked key", { actorId: userId, keyId, },);

          return jsonResponse({
            id: keyId,
            status: "revoked",
            message: "Key revoked. Messages encrypted with this key are now inaccessible.",
          },);
        } catch (error) {
          log().error(`Failed to revoke key ${keyId} for actor ${userId}: ${String(error,)}`,);
          return jsonError({
            message: "Failed to revoke key",
            status: HttpStatus.InternalServerError,
          },);
        }
      },
      {
        params: t.Object({ id: t.String(), },),
        response: {
          200: SuccessResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Revoke an encryption key",
          description: "Irreversibly revokes a key. Messages encrypted with this key become inaccessible.",
          tags: ["Admin", "Keys",],
        },
      },
    );
}
