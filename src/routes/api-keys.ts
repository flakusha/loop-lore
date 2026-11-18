// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

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
import { BYOK_KEY_VERSION, deriveUserKek, encryptVersioned, kekAad, } from "../crypto";
import type { DB, } from "../db/schema";
import {
  listProviderInstances,
  listSdProviderInstances,
  listVideoProviderInstances,
} from "../generation/providers/provider-instances";
import { uid, } from "../utils";
import { forbidden, notFound, } from "../validation/middleware";
import { ApiKeyCreateBody, ErrorResponse, SuccessResponse, } from "../validation/schemas";
import { HttpStatus, jsonError, jsonResponse, withUserAuth, } from "./http-utils";

/**
 * @param root0
 * @param root0.database
 * @param root0.config
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { "user-api-keys": { ...; }; }; } & { ...; } & { ...; }, { ...; }, { ...; }>}
 */
export function apiKeysRoutes({ database, config: cfg, }: { database: Kysely<DB>; config: Config }, prefix = "/api",) {
  const config = cfg;
  return new Elysia({ name: "api-keys", },)
    .get(`${prefix}/user-api-keys`, (ctx,) =>
      withUserAuth(ctx, async (userId,) => {
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
      },), {
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
      },
      detail: {
        summary: "List user's stored API keys",
        description: "Returns all BYO API keys stored by the authenticated user, showing provider name and timestamps.",
        tags: ["Admin", "API Keys",],
      },
    },)
    .post(`${prefix}/user-api-keys`, (ctx,) =>
      withUserAuth(ctx, async (userId,) => {
        if (!config.byoKey.enabled) {
          return forbidden("BYO API key feature is disabled",);
        }

        const { name: providerName, api_key: apiKey, } = ctx.body;

        const encryptionSecret = config.byoKey.encryptionKey;
        if (!encryptionSecret) {
          return jsonError({
            message: (ctx as any).t?.("crypto.encryptionKeyMissing",) ??
              "Server encryption key not configured — contact administrator",
            status: HttpStatus.InternalServerError,
          },);
        }

        // Validate the provider exists in config — every provider instance the
        // registry can dispatch to, plus the configured image and video
        // providers (generation.providers.sd / .video) so ComfyUI workflow
        // engines are BYO-keyable (epic-byok-api-keys.md Known Gap).
        const knownProviders = [
          ...listProviderInstances(config,).map((instance,) => instance.name),
          ...listSdProviderInstances(config,).map((instance,) => instance.name),
          ...listVideoProviderInstances(config,).map((instance,) => instance.name),
        ];

        if (!knownProviders.includes(providerName,)) {
          return jsonError({ message: `Unknown provider: ${providerName}`, status: HttpStatus.BadRequest, },);
        }

        // Per-user KEK (v3): the row is sealed under a key derived from the
        // master secret + userId, with userId:provider bound as AAD. Another
        // user's KEK opens nothing, and a transplanted row fails auth.
        // v1/v2 rows keep the legacy global-secret path in the resolver, so no
        // migration pass is needed.
        let encrypted: string;
        try {
          const userKek = await deriveUserKek(encryptionSecret, userId,);
          encrypted = await encryptVersioned(apiKey, userKek, kekAad(userId, providerName,),);
        } catch {
          return jsonError({
            message: (ctx as any).t?.("crypto.keyEncryptFailed",) ?? "Failed to encrypt API key",
            status: HttpStatus.InternalServerError,
          },);
        }

        // Atomic upsert
        // (BUG-user-api-keys-non-unique-index-read-then-write-upsert-allows):
        // the old read-then-write window let two concurrent POSTs both insert
        // (dup rows, arbitrary executeTakeFirst reads) — and after the 078
        // unique index, it turned the loser into a constraint crash. The
        // conflict-target upsert makes the raced pair one insert + one update.
        await database
          .insertInto("user_api_keys",)
          .values({
            id: uid(),
            user_id: userId,
            provider_name: providerName,
            api_key_encrypted: encrypted,
            key_version: BYOK_KEY_VERSION,
          },)
          .onConflict((oc,) =>
            oc.columns(["user_id", "provider_name",],).doUpdateSet({
              api_key_encrypted: encrypted,
              key_version: BYOK_KEY_VERSION,
              updated_at: new Date().toISOString(),
            },)
          )
          .execute();

        return jsonResponse({ ok: true, provider: providerName, },);
      },), {
      body: ApiKeyCreateBody,
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
      },
      detail: {
        summary: "Store or update a BYO API key",
        description:
          "Encrypts and stores an API key for the specified provider. Upserts if the provider already has a key.",
        tags: ["Admin", "API Keys",],
      },
    },)
    .delete(`${prefix}/user-api-keys/:provider`, (ctx,) =>
      withUserAuth(ctx, async (userId,) => {
        const params = (ctx as any).params as { provider: string };
        const provider = params.provider;

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
      },), {
      response: {
        401: ErrorResponse,
      },
      detail: {
        summary: "Delete a stored API key",
        description: "Permanently removes the stored API key for the specified provider.",
        tags: ["Admin", "API Keys",],
      },
    },);
}
