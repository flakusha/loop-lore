// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW Moderation Service — flag projections, mapper, reporter hash, and
 * queue/description limits. Pulled out of `flags.ts` so the actions
 * (flag/queue/resolve) live in a leaner module.
 */
import type { ContentFlag, } from "./types";

/**
 * Map a storage row (snake_case) to the camel-cased ContentFlag shape.
 * @param row
 * @param row.id
 * @param row.reporter_id
 * @param row.content_type
 * @param row.content_id
 * @param row.chat_id
 * @param row.world_id
 * @param row.flag_reason
 * @param row.description
 * @param row.status
 * @param row.resolution
 * @param row.resolved_by
 * @param row.resolved_at
 * @param row.created_at
 */
export function mapFlag(
  row: {
    id: string;
    reporter_id: string;
    content_type: string;
    content_id: string;
    chat_id: string | null;
    world_id: string | null;
    flag_reason: string;
    description: string | null;
    status: string;
    resolution: string | null;
    resolved_by: string | null;
    resolved_at: string | null;
    created_at: string;
  },
): ContentFlag {
  return {
    id: row.id,
    reporterId: row.reporter_id,
    contentType: row.content_type,
    contentId: row.content_id,
    chatId: row.chat_id,
    worldId: row.world_id,
    flagReason: row.flag_reason,
    description: row.description,
    status: row.status,
    resolution: row.resolution,
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
  };
}

/**
 * Wire-level projection of a flag for the moderation queue.
 *
 * Strips reporter identity (`reporterId`), free-text PII (`description`),
 * and contextual ids (`chatId`, `worldId`, `contentId`). The reporter is
 * replaced with a stable server-derived hash (`reporterHash`) so admins
 * can still correlate repeat reporters across flags.
 */
export interface FlagQueueView {
  id: string;
  contentType: string;
  flagReason: string;
  status: string;
  resolution: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  reporterHash: string;
  createdAt: string;
}

/** Minimal projection returned from `resolveFlag` to the admin on resolution. */
export interface ResolvedFlagView {
  id: string;
  status: string;
  resolution: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
}

const FLAG_QUEUE_LIMIT_CAP = 100;
const FLAG_DESCRIPTION_MAX = 1000;

/** Resolve the reporter-hash HMAC secret, production-gated. */
export function resolveReporterHashSecret(): string {
  const envSecret = process.env["NSFW_FLAG_REPORTER_HASH_SECRET"] ??
    process.env["NSFW_MODERATION_HMAC_SECRET"];
  if (envSecret) { return envSecret; }
  const env = process.env["NODE_ENV"] ?? "";
  if (env === "test" || env === "development" || env === "dev") {
    return "loop-lore-nsfw-default-do-not-use-in-prod";
  }
  throw new Error(
    "NSFW_FLAG_REPORTER_HASH_SECRET is required in production. Set it to a random string.",
  );
}

const REPORTER_HASH_SECRET = resolveReporterHashSecret();

/**
 * Stable, opaque hash of a reporter id. Allows admins to correlate repeat
 * reporters across flags without exposing raw user ids.
 *
 * SECURITY: the secret is production-gated (see resolveReporterHashSecret)
 * so a deployment without `NSFW_FLAG_REPORTER_HASH_SECRET` cannot boot in
 * production with a known default salt.
 * @param reporterId - Raw reporter id (UUID).
 * @returns 32-char hex digest prefixed with "rh_".
 */
export function hashReporterId(reporterId: string,): string {
  const hasher = new Bun.CryptoHasher("sha256", REPORTER_HASH_SECRET,);
  hasher.update(reporterId,);
  return `rh_${hasher.digest("hex",).slice(0, 32,)}`;
}

/**
 * Project a ContentFlag to the queue-view shape (no reporter PII).
 * @param row
 */
export function toQueueView(row: ContentFlag,): FlagQueueView {
  return {
    id: row.id,
    contentType: row.contentType,
    flagReason: row.flagReason,
    status: row.status,
    resolution: row.resolution,
    resolvedBy: row.resolvedBy,
    resolvedAt: row.resolvedAt,
    reporterHash: hashReporterId(row.reporterId,),
    createdAt: row.createdAt,
  };
}

/**
 * Project a ContentFlag to the minimal resolved view returned to admins.
 * @param row
 */
export function toResolvedView(row: ContentFlag,): ResolvedFlagView {
  return {
    id: row.id,
    status: row.status,
    resolution: row.resolution,
    resolvedBy: row.resolvedBy,
    resolvedAt: row.resolvedAt,
  };
}

/**
 * Enforce the maximum `description` length on flag creation.
 * @param description
 */
export function checkDescriptionLength(description: string | null | undefined,): void {
  if (description && description.length > FLAG_DESCRIPTION_MAX) {
    throw new Error(
      `Description too long (${description.length} > ${FLAG_DESCRIPTION_MAX} chars). Use a shorter structured flagReason instead.`,
    );
  }
}

/**
 * Server-side cap on `limit` for the flag queue (max 100).
 * @param limit
 */
export function clampFlagLimit(limit: number | undefined,): number {
  if (!limit || !Number.isFinite(limit,) || limit <= 0) { return 50; }
  return Math.min(Math.floor(limit,), FLAG_QUEUE_LIMIT_CAP,);
}
