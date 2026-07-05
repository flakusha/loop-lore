/**
 * User API Key Routes
 *
 * BYO API key management:
 *   GET    /api/user-api-keys           — list user's stored keys
 *   POST   /api/user-api-keys           — store a new API key
 *   DELETE /api/user-api-keys/:provider — delete a stored key
 */

import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import type { RequestContext } from "../middleware/types";
import type { Config } from "../config/schema";
import type { RouteDispatch } from "./router";
import { registerRoute } from "./router";
import {
  BAD_METHOD,
  jsonResponse,
  jsonError,
  jsonCreated,
  jsonNoContent,
  HttpStatus,
  ErrorCode,
  parseBody,
} from "./http-utils";
import { uid } from "../utils";
import { encryptValue } from "../crypto";

interface ListKeysOpts { database: Kysely<DB>; context: RequestContext; }
interface CreateKeyOpts { database: Kysely<DB>; context: RequestContext; body: Record<string, unknown>; config: Config; }
interface DeleteKeyOpts { database: Kysely<DB>; context: RequestContext; provider: string; config: Config; }

function extractProvider(pathname: string): string | null {
  const match = /^\/api\/user-api-keys\/(.+)$/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

const dispatch: RouteDispatch = async ({ request, context, database, config }) => {
  // Require auth for all key routes
  if (!context.userId) {
    return jsonError("Unauthorized", HttpStatus.Unauthorized, ErrorCode.Unauthorized);
  }

  // Check BYO key feature is enabled
  if (!config.byoKey.enabled) {
    return jsonError("BYO API key feature is disabled", HttpStatus.Forbidden, ErrorCode.Forbidden);
  }

  const url = new URL(request.url);
  const { pathname } = url;
  const method = request.method;

  // /api/user-api-keys/:provider — DELETE
  if (pathname.startsWith("/api/user-api-keys/")) {
    const provider = extractProvider(pathname);
    if (!provider) return jsonError("Provider name required", HttpStatus.BadRequest);

    if (method === "DELETE") return handleDeleteKey({ database, context, provider, config });
    return BAD_METHOD();
  }

  // /api/user-api-keys — GET, POST
  if (pathname === "/api/user-api-keys") {
    if (method === "GET") return handleListKeys({ database, context });
    if (method === "POST") {
      const body = await parseBody(request);
      if (body instanceof Response) return body;
      return handleCreateKey({ database, context, body, config });
    }
    return BAD_METHOD();
  }

  return null; // Not a key route
};

/**
 * GET /api/user-api-keys — list user's stored keys (provider names only, no secrets)
 */
async function handleListKeys({ database, context }: ListKeysOpts): Promise<Response> {
  const userId = context.userId as string;
  const keys = await database
    .selectFrom("user_api_keys")
    .select(["provider_name", "created_at", "updated_at"])
    .where("user_id", "=", userId)
    .orderBy("provider_name", "asc")
    .execute();

  return jsonResponse(keys);
}

/**
 * POST /api/user-api-keys — store a new API key
 */
async function handleCreateKey({ database, context, body, config }: CreateKeyOpts): Promise<Response> {
  const userId = context.userId as string;
  const providerName = body.providerName as string | undefined;

  if (!providerName) return jsonError("providerName is required", HttpStatus.BadRequest);

  const apiKey = body.apiKey as string | undefined;
  if (!apiKey) return jsonError("apiKey is required", HttpStatus.BadRequest);

  const encryptionSecret = config.byoKey.encryptionKey;
  if (!encryptionSecret) {
    return jsonError(
      "Server encryption key not configured — contact administrator",
      HttpStatus.InternalServerError,
      ErrorCode.ServerError,
    );
  }

  // Validate provider exists in config
  const providerConfigs = config.generation.providers.openaiCompatible;
  const providerExists = providerConfigs.some(
    (p: { name?: string }) => p.name === providerName,
  );
  if (!providerExists) {
    return jsonError(`Unknown provider: ${providerName}`, HttpStatus.BadRequest);
  }

  // Encrypt the key
  let encrypted: string;
  try {
    encrypted = await encryptValue(apiKey, encryptionSecret);
  } catch {
    return jsonError("Failed to encrypt API key", HttpStatus.InternalServerError, ErrorCode.ServerError);
  }

  // Upsert — insert or update if provider already exists for this user
  const existing = await database
    .selectFrom("user_api_keys")
    .select("id")
    .where("user_id", "=", userId)
    .where("provider_name", "=", providerName)
    .executeTakeFirst();

  if (existing) {
    await database
      .updateTable("user_api_keys")
      .set({
        api_key_encrypted: encrypted,
        updated_at: new Date().toISOString(),
      })
      .where("id", "=", existing.id)
      .execute();
    return jsonResponse({ ok: true, provider: providerName });
  }

  const id = uid();
  await database
    .insertInto("user_api_keys")
    .values({
      id,
      user_id: userId,
      provider_name: providerName,
      api_key_encrypted: encrypted,
    })
    .execute();

  return jsonCreated({ id, provider: providerName });
}

/**
 * DELETE /api/user-api-keys/:provider — delete a stored key
 */
async function handleDeleteKey({ database, context, provider, config }: DeleteKeyOpts): Promise<Response> {
  const userId = context.userId as string;
  const encryptionSecret = config.byoKey.encryptionKey;
  if (!encryptionSecret) {
    return jsonError(
      "Server encryption key not configured — contact administrator",
      HttpStatus.InternalServerError,
      ErrorCode.ServerError,
    );
  }

  // Verify the key exists and belongs to user
  const existing = await database
    .selectFrom("user_api_keys")
    .select("id")
    .where("user_id", "=", userId)
    .where("provider_name", "=", provider)
    .executeTakeFirst();

  if (!existing) {
    return jsonError("Key not found", HttpStatus.NotFound, ErrorCode.NotFound);
  }

  await database
    .deleteFrom("user_api_keys")
    .where("id", "=", existing.id)
    .execute();

  return jsonNoContent();
}

registerRoute(dispatch); // eslint-disable-line unicorn/no-top-level-side-effects
export { dispatch };
