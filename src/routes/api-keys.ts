/**
 * User API Key Routes
 *
 * BYO API key management:
 *   GET    /api/user-api-keys           — list user's stored keys
 *   POST   /api/user-api-keys           — store a new API key
 *   DELETE /api/user-api-keys/:provider — delete a stored key
 *
 * Elysia plugin — uses auth guard for authentication.
 */

import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../config/schema";
import { encryptValue, } from "../crypto";
import type { DB, } from "../db/schema";
import { uid, } from "../utils";
import { forbidden, notFound, } from "../validation/middleware";
import { HttpStatus, jsonError, jsonResponse, requireUserId, } from "./http-utils";

export function apiKeysRoutes({ database, config: cfg, }: { database: Kysely<DB>; config: Config },) {
  const config = cfg;
  return new Elysia({ name: "api-keys", },)
    .get("/api/user-api-keys", async (ctx,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }

      if (!config.byoKey.enabled) {
        return forbidden("BYO API key feature is disabled",);
      }

      const keys = await database
        .selectFrom("user_api_keys",)
        .select(["provider_name", "created_at", "updated_at",],)
        .where("user_id", "=", userId,)
        .orderBy("provider_name", "asc",)
        .execute();

      return jsonResponse(keys,);
    },)
    .post("/api/user-api-keys", async (ctx,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }

      if (!config.byoKey.enabled) {
        return forbidden("BYO API key feature is disabled",);
      }

      const body = ctx.body as Record<string, unknown> | undefined;
      if (!body || typeof body !== "object") {
        return jsonError({ message: "Invalid JSON body", status: HttpStatus.BadRequest, },);
      }

      const providerName = body.providerName as string | undefined;
      if (!providerName) {
        return jsonError({ message: "providerName is required", status: HttpStatus.BadRequest, },);
      }

      const apiKey = body.apiKey as string | undefined;
      if (!apiKey) { return jsonError({ message: "apiKey is required", status: HttpStatus.BadRequest, },); }

      const encryptionSecret = config.byoKey.encryptionKey;
      if (!encryptionSecret) {
        return jsonError({
          message: "Server encryption key not configured — contact administrator",
          status: HttpStatus.InternalServerError,
        },);
      }

      // Validate provider exists in config
      const providerConfigs = config.generation.providers.openaiCompatible;
      const providerExists = providerConfigs.some((p: { name?: string },) => p.name === providerName);
      if (!providerExists) {
        return jsonError({ message: `Unknown provider: ${providerName}`, status: HttpStatus.BadRequest, },);
      }

      // Encrypt the key
      let encrypted: string;
      try {
        encrypted = await encryptValue(apiKey, encryptionSecret,);
      } catch {
        return jsonError({
          message: "Failed to encrypt API key",
          status: HttpStatus.InternalServerError,
        },);
      }

      // Upsert — insert or update if provider already exists for this user
      const existing = await database
        .selectFrom("user_api_keys",)
        .select("id",)
        .where("user_id", "=", userId,)
        .where("provider_name", "=", providerName,)
        .executeTakeFirst();

      if (existing) {
        await database
          .updateTable("user_api_keys",)
          .set({
            api_key_encrypted: encrypted,
            updated_at: new Date().toISOString(),
          },)
          .where("id", "=", existing.id,)
          .execute();
        return jsonResponse({ ok: true, provider: providerName, },);
      }

      await database
        .insertInto("user_api_keys",)
        .values({
          id: uid(),
          user_id: userId,
          provider_name: providerName,
          api_key_encrypted: encrypted,
        },)
        .execute();

      return jsonResponse({ ok: true, provider: providerName, },);
    },)
    .delete("/api/user-api-keys/:provider", async (ctx,) => {
      const params = (ctx as any).params as { provider: string };
      const provider = params.provider;
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }

      const existing = await database
        .selectFrom("user_api_keys",)
        .select("id",)
        .where("user_id", "=", userId,)
        .where("provider_name", "=", provider,)
        .executeTakeFirst();

      if (!existing) {
        return notFound("Key not found",);
      }

      await database.deleteFrom("user_api_keys",).where("id", "=", existing.id,).execute();

      return new Response(null, { status: 204, },);
    },);
}
