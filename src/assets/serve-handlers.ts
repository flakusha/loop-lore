// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Asset serve handlers for compressed variants (thumb/compressed). Raw and
 * download live in ./serve-raw.ts (extracted to keep this file under the
 * per-module size-strict gate).
 *
 * Shared by the live router (controller.ts). A valid signed-URL token
 * replaces session auth on these paths; otherwise the actor access check
 * (`canAccessAsset`) applies.
 */
import type { Kysely, } from "kysely";
import type { Config, } from "../config/schema";
import type { DB, } from "../db/schema";
import { forbiddenResponse, notFoundResponse, } from "../routes/http-utils";
import { serveFile, } from "./serve-file";
import { canAccessAsset, getAsset, getAssetFilePath, } from "./service";
import type { AssetRecord, } from "./service";
import { resolveSignedUrlSecret, type SignedUrlAction, verifyAssetUrl, } from "./signed-url";
import { resolveCompressedVariantPath, } from "./variant-path";

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
 * @param database - Kysely database instance.
 * @param assetId - Asset identifier (uuid).
 * @param actorId - Requesting actor identifier.
 * @param actorRole - Requesting actor role.
 * @returns The asset on success, or a Response on failure.
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
 * @param searchParams - Request URL query params.
 * @param action - Signed-URL action being authorized.
 * @param config - Server config (signed-URL secret).
 * @returns {} when no `sig`+`expires` params are present (→ session auth);
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
 * @param opts - Serve request fields incl. optional signed-URL auth.
 * @returns The resolved asset, or a `Response` on auth failure.
 */
export async function resolveForServe(
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

/**
 * Serve a compressed variant (thumb/compressed), falling back to raw.
 * @param root0
 * @param root0.database
 * @param root0.assetId
 * @param root0.uploadDir
 * @param root0.variant
 * @param root0.actorId
 * @param root0.actorRole
 * @param root0.signedUrlSecret
 * @param root0.signedUrlToken
 * @param root0.signedUrlExpires
 * @param root0.signedUrlAction
 * @returns Compressed asset bytes response.
 */
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

  const fullPath = resolveCompressedVariantPath({
    uploadDir,
    assetId,
    variant,
    thumbnailPath: resolved.asset.thumbnail_path,
  },);

  // Fall back to raw if no compressed variant exists
  if (!fullPath) {
    return serveFile(getAssetFilePath(uploadDir, resolved.asset.storage_path,), resolved.asset.mime_type,);
  }
  return serveFile(fullPath, "image/webp",);
}
