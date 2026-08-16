// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Asset Controller — signed-URL + asset-serving routes.
 * Signed, time-limited URLs let a client fetch an asset without a fresh
 * session (e.g. `<img src>`). The serve handlers accept `sig`+`expires`
 * query params as an ALTERNATIVE to session auth; when absent they fall
 * back to the existing actor auth path.
 */
import type { Config, } from "../../config/schema";
import {
  badRequestResponse,
  forbiddenResponse,
  jsonResponse,
} from "../../routes/http-utils";
import { resolveAsset, } from "./access";
import type { RouteDeps, } from "./handlers";
import { handleDownload, handleServeCompressed, handleServeRaw, } from "./serve";
import {
  isSignedUrlAction,
  resolveSignedUrlSecret,
  signAssetUrl,
} from "./signed-url";
import type { SignedUrlAction, } from "./signed-url";
import type { RouteCtx, ServeRawOpts, } from "./types";

/**
 * Extract signed-URL auth params from a serve request's query string.
 * Returns null when no `sig`+`expires` params are present (→ session auth),
 * or a signed-URL opts object when they are. The secret is resolved here and
 * passed through so serve.ts can verify fail-closed.
 */
function signedAuthParams(
  searchParams: URLSearchParams,
  action: SignedUrlAction,
  config: Config,
):
  | Pick<
    ServeRawOpts,
    "signedUrlSecret" | "signedUrlToken" | "signedUrlExpires" | "signedUrlAction"
  >
  | null
{
  const token = searchParams.get("sig",);
  const expiresRaw = searchParams.get("expires",);
  if (!token || !expiresRaw) { return null; }
  return {
    signedUrlSecret: resolveSignedUrlSecret(config.assets.signedUrlSecret, config.auth.jwtSecret,),
    signedUrlToken: token,
    signedUrlExpires: Number(expiresRaw,),
    signedUrlAction: action,
  };
}

export async function handleServeRawRoute(
  { database, config, ctx, }: RouteDeps & { ctx: RouteCtx },
): Promise<Response> {
  const searchParams = new URL(ctx.request.url,).searchParams;
  const chatId = searchParams.get("chatId",) ?? undefined;
  const signed = signedAuthParams(searchParams, "raw", config,);
  return handleServeRaw({
    database,
    assetId: ctx.params.id!,
    uploadDir: config.assets.uploadDir,
    actorId: ctx.userId ?? null,
    actorRole: ctx.userRole ?? null,
    chatId,
    ...signed,
  },);
}

export async function handleDownloadRoute(
  { database, config, ctx, }: RouteDeps & { ctx: RouteCtx },
): Promise<Response> {
  const searchParams = new URL(ctx.request.url,).searchParams;
  const chatId = searchParams.get("chatId",) ?? undefined;
  const signed = signedAuthParams(searchParams, "download", config,);
  return handleDownload({
    database,
    assetId: ctx.params.id!,
    uploadDir: config.assets.uploadDir,
    actorId: ctx.userId ?? null,
    actorRole: ctx.userRole ?? null,
    chatId,
    ...signed,
  },);
}

export async function handleCompressedRoute(
  { database, config, ctx, }: RouteDeps & { ctx: RouteCtx },
  variant: string,
): Promise<Response> {
  const searchParams = new URL(ctx.request.url,).searchParams;
  const action: SignedUrlAction = variant === "thumb" ? "thumb" : "compressed";
  const signed = signedAuthParams(searchParams, action, config,);
  return handleServeCompressed({
    database,
    assetId: ctx.params.id!,
    uploadDir: config.assets.uploadDir,
    variant,
    actorId: ctx.userId ?? null,
    actorRole: ctx.userRole ?? null,
    ...signed,
  },);
}

/**
 * Generate a signed URL for an asset serve action.
 * Requires the caller to be able to access the asset (same gate as serving).
 * Returns `{ url, token, expiresAt }` where url already carries `sig`+`expires`.
 */
export async function handleSignedUrlRoute(
  { database, config, ctx, }: RouteDeps & { ctx: RouteCtx },
): Promise<Response> {
  const userId = ctx.userId ?? null;
  const userRole = ctx.userRole ?? null;
  const resolved = await resolveAsset(database, ctx.params.id!, userId, userRole,);
  if (resolved instanceof Response) { return resolved; }

  const actionParam = ctx.params.action ?? "raw";
  if (!isSignedUrlAction(actionParam,)) {
    return badRequestResponse("Invalid signed-URL action",);
  }

  const secret = resolveSignedUrlSecret(config.assets.signedUrlSecret, config.auth.jwtSecret,);
  if (!secret) {
    return forbiddenResponse("Signed URLs are not configured",);
  }

  const expiresInSeconds = config.assets.signedUrlExpirySeconds ?? 900;
  const signed = await signAssetUrl({
    secret,
    assetId: ctx.params.id!,
    action: actionParam,
    expiresInSeconds,
  },);
  const url = `/api/assets/${ctx.params.id}/${actionParam}?expires=${signed.expiresAt}&sig=${signed.token}`;
  return jsonResponse({ url, token: signed.token, expiresAt: signed.expiresAt, action: actionParam, },);
}
