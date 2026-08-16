// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Asset Controller — shared types
 */
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import type { AssetRecord, } from "../service";

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
}

export interface ServeCompressedOpts {
  database: Kysely<DB>;
  assetId: string;
  uploadDir: string;
  variant: string;
  actorId: string | null;
  actorRole: string | null;
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
