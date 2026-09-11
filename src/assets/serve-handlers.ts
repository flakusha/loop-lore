// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 293

/**
 * Asset serve handlers — raw / download / thumb / compressed.
 *
 * Shared by the live router (controller.ts). A valid signed-URL token
 * replaces session auth on these paths; otherwise the actor access check
 * (`canAccessAsset`) applies.
 */
import type { Kysely, } from "kysely";
import { existsSync, } from "node:fs";
import { IMMUTABLE_CACHE_MAX_AGE, } from "../config/constants";
import type { Config, } from "../config/schema";
import { deriveChatKeyForChat, getSmk, } from "../crypto";
import type { DB, } from "../db/schema";
import { forbiddenResponse, notFoundResponse, } from "../routes/http-utils";
import { serveFile, } from "./serve-file";
import { canAccessAsset, getAsset, getAssetData, getAssetFilePath, } from "./service";
import type { AssetRecord, } from "./service";
import { resolveSignedUrlSecret, type SignedUrlAction, verifyAssetUrl, } from "./signed-url";

/** Serve-options for raw bytes and downloads (also compressed variants). */
export interface ServeRawOpts {
  database: Kysely<DB>;
  assetId: string;
  uploadDir: string;
  actorId: string | null;
  actorRole: string | null;
  /** Signed-URL auth (alternative to session) — resolved from query params. */
  signedUrlSecret?: string;
  signedUrlToken?: string;
  signedUrlExpires?: number;
  signedUrlAction?: SignedUrlAction;
}

export interface ServeCompressedOpts {
  database: Kysely<DB>;
  assetId: string;
  uploadDir: string;
  variant: string;
  actorId: string | null;
  actorRole: string | null;
  signedUrlSecret?: string;
  signedUrlToken?: string;
  signedUrlExpires?: number;
  signedUrlAction?: SignedUrlAction;
}

interface ResolvedAsset {
  asset: AssetRecord;
}

/**
 * Load an asset after the actor-based access check (`canAccessAsset`).
 * Returns the asset on success, or a Response on failure.
 */
export async function resolveAsset(
  database: Kysely<DB>,
  assetId: string,
  actorId: string | null,
  actorRole: string | null,
): Promise<ResolvedAsset | Response> {
  const allowed = await canAccessAsset(database, assetId, actorId, actorRole,);
  if (!allowed) {
    return notFoundResponse();
  }

  const asset = await getAsset(database, assetId,);
  if (!asset) {
    return notFoundResponse("Asset not found",);
  }

  return { asset, };
}

/** Signed-URL fields shared by the serve-route opts. */
type SignedUrlAuth = Pick<
  ServeRawOpts,
  "signedUrlSecret" | "signedUrlToken" | "signedUrlExpires" | "signedUrlAction"
>;

/**
 * Extract signed-URL auth params from a serve request query string.
 * Returns {} when no `sig`+`expires` params are present (→ session auth);
 * otherwise resolved opts the serve handlers verify fail-closed.
 */
export function signedUrlAuth(
  searchParams: URLSearchParams,
  action: SignedUrlAction,
  config: Config,
): SignedUrlAuth {
  const token = searchParams.get("sig",);
  const expiresRaw = searchParams.get("expires",);
  if (!token || !expiresRaw) { return {}; }
  return {
    signedUrlSecret: resolveSignedUrlSecret(config.assets.signedUrlSecret, config.auth.jwtSecret,) ?? undefined,
    signedUrlToken: token,
    signedUrlExpires: Number(expiresRaw,),
    signedUrlAction: action,
  };
}

/**
 * Resolve the actor-facing asset record for a serve request.
 * A valid signed-URL token replaces session auth (the token already encodes
 * asset + action + expiry); otherwise the actor access check applies.
 */
async function resolveForServe(
  opts: Pick<ServeRawOpts, "database" | "assetId" | "actorId" | "actorRole"> & SignedUrlAuth,
): Promise<ResolvedAsset | Response> {
  if (opts.signedUrlToken) {
    if (
      !opts.signedUrlSecret ||
      !opts.signedUrlAction ||
      !Number.isFinite(opts.signedUrlExpires ?? NaN,)
    ) {
      return forbiddenResponse("Invalid signed URL",);
    }
    const result = await verifyAssetUrl({
      secret: opts.signedUrlSecret,
      token: opts.signedUrlToken,
      assetId: opts.assetId,
      action: opts.signedUrlAction,
      expiresAt: opts.signedUrlExpires!,
    },);
    if (!result.valid) {
      return forbiddenResponse("Invalid or expired signed URL",);
    }
    // Token authorizes this asset — load it without the actor gate.
    const asset = await getAsset(opts.database, opts.assetId,);
    if (!asset) {
      return notFoundResponse("Asset not found",);
    }
    return { asset, };
  }
  return resolveAsset(opts.database, opts.assetId, opts.actorId, opts.actorRole,);
}

/** Serve the original file (raw bytes, decrypting chat-encrypted assets). */
export async function handleServeRaw({
  database,
  assetId,
  uploadDir,
  actorId,
  actorRole,
  chatId,
  signedUrlSecret,
  signedUrlToken,
  signedUrlExpires,
  signedUrlAction,
}: ServeRawOpts & { chatId?: string },): Promise<Response> {
  const resolved = await resolveForServe({
    database,
    assetId,
    actorId,
    actorRole,
    signedUrlSecret,
    signedUrlToken,
    signedUrlExpires,
    signedUrlAction,
  },);
  if (resolved instanceof Response) { return resolved; }

  const { asset, } = resolved;

  // If asset is encrypted, try to decrypt
  if (asset.encryption_tier !== "public" && asset.encrypted_key_id) {
    try {
      // Get SMK and derive chat key if chatId provided
      const smk = getSmk();
      if (!smk || !chatId) {
        return new Response("Encrypted asset requires chat context", { status: 400, },);
      }

      const chatKey = await deriveChatKeyForChat(database, chatId, smk,);
      const decryptedData = await getAssetData(database, assetId, uploadDir, chatKey,);

      if (!decryptedData) {
        return notFoundResponse("Failed to decrypt asset",);
      }

      return new Response(new Uint8Array(decryptedData,), {
        headers: {
          "Content-Type": asset.mime_type,
          "Cache-Control": `public, max-age=${IMMUTABLE_CACHE_MAX_AGE}, immutable`,
          "X-Content-Type-Options": "nosniff",
        },
      },);
    } catch {
      return new Response("Failed to decrypt asset", { status: 500, },);
    }
  }

  // Non-encrypted asset — serve directly
  return serveFile(getAssetFilePath(uploadDir, asset.storage_path,), asset.mime_type,);
}

/** Serve a compressed variant (thumb/compressed), falling back to raw. */
export async function handleServeCompressed({
  database,
  assetId,
  uploadDir,
  variant,
  actorId,
  actorRole,
  signedUrlSecret,
  signedUrlToken,
  signedUrlExpires,
  signedUrlAction,
}: ServeCompressedOpts,): Promise<Response> {
  const resolved = await resolveForServe({
    database,
    assetId,
    actorId,
    actorRole,
    signedUrlSecret,
    signedUrlToken,
    signedUrlExpires,
    signedUrlAction,
  },);
  if (resolved instanceof Response) { return resolved; }

  const subDir = `${assetId.slice(0, 2,)}/${assetId.slice(2, 4,)}`;
  const compressedPath = `compressed/${subDir}/${assetId}_${variant}.webp`;
  const fullPath = getAssetFilePath(uploadDir, compressedPath,);

  // Fall back to raw if no compressed variant
  if (!existsSync(fullPath,)) {
    return serveFile(getAssetFilePath(uploadDir, resolved.asset.storage_path,), resolved.asset.mime_type,);
  }
  return serveFile(fullPath, "image/webp",);
}

/** Serve the original file as an attachment download. */
export async function handleDownload({
  database,
  assetId,
  uploadDir,
  actorId,
  actorRole,
  chatId,
  signedUrlSecret,
  signedUrlToken,
  signedUrlExpires,
  signedUrlAction,
}: ServeRawOpts & { chatId?: string },): Promise<Response> {
  const resolved = await resolveForServe({
    database,
    assetId,
    actorId,
    actorRole,
    signedUrlSecret,
    signedUrlToken,
    signedUrlExpires,
    signedUrlAction,
  },);
  if (resolved instanceof Response) { return resolved; }
  const { asset, } = resolved;
  const safeName = asset.filename.replaceAll(/[^\w.-]+/g, "_",);

  // If asset is encrypted, try to decrypt
  if (asset.encryption_tier !== "public" && asset.encrypted_key_id) {
    try {
      const smk = getSmk();
      if (!smk || !chatId) {
        return new Response("Encrypted asset requires chat context", { status: 400, },);
      }

      const chatKey = await deriveChatKeyForChat(database, chatId, smk,);
      const decryptedData = await getAssetData(database, assetId, uploadDir, chatKey,);

      if (!decryptedData) {
        return notFoundResponse("Failed to decrypt asset",);
      }

      return new Response(new Uint8Array(decryptedData,), {
        headers: {
          "Content-Type": asset.mime_type,
          "Content-Disposition": `attachment; filename="${safeName}"`,
        },
      },);
    } catch {
      return new Response("Failed to decrypt asset", { status: 500, },);
    }
  }

  return serveFile(getAssetFilePath(uploadDir, asset.storage_path,), asset.mime_type, {
    extraHeaders: { "Content-Disposition": `attachment; filename="${safeName}"`, },
  },);
}
