// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Asset Controller — shared types
 */
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import type { AssetRecord, } from "../service";
import type { SignedUrlAction, } from "./signed-url";

/** Upload options — also used by elysia-app.ts for the standalone POST /api/assets route. */
export interface UploadOpts {
  request: Request;
  userId: string;
  database: Kysely<DB>;
  uploadDir: string;
  maxFileSize: number;
  /** Chat ID for encryption context (optional — public storage when omitted). */
  chatId?: string;
  /** App config for encryption settings. */
  config?: Config;
}

export interface ServeRawOpts {
  database: Kysely<DB>;
  assetId: string;
  uploadDir: string;
  actorId: string | null;
  actorRole: string | null;
  /** HMAC secret for signed-URL verification (fail-closed when set and a token is present). */
  signedUrlSecret?: string | null;
  /** Signed-URL token (`sig` query param). When present, bypasses actor auth after verification. */
  signedUrlToken?: string | null;
  /** Signed-URL expiry (`expires` query param, epoch ms). */
  signedUrlExpires?: number | null;
  /** Signed-URL action this token must be bound to. */
  signedUrlAction?: SignedUrlAction | null;
}

export interface ServeCompressedOpts {
  database: Kysely<DB>;
  assetId: string;
  uploadDir: string;
  variant: string;
  actorId: string | null;
  actorRole: string | null;
  /** Optional signed-URL auth (same semantics as ServeRawOpts). */
  signedUrlSecret?: string | null;
  signedUrlToken?: string | null;
  signedUrlExpires?: number | null;
  signedUrlAction?: SignedUrlAction | null;
}

export interface ResolvedAsset {
  asset: AssetRecord;
}

/**
 * Minimal Elysia request context shape consumed by route handlers.
 * `userId`/`userRole` are populated by the auth plugin; `body` is Elysia's
 * parsed request body.
 */
export interface RouteCtx {
  request: Request;
  params: Record<string, string>;
  body: unknown;
  userId?: string | null;
  userRole?: string | null;
}
