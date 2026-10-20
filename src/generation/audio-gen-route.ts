// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * POST /api/audio/ambient — generate a layered ambient track from scene tags.
 *
 * Authorization mirrors image generation (BUG-generation-control-plane-routes-
 * lack-authorization): unauthenticated callers get 401, and chat linkage is
 * scoped to chats the caller may access (IDOR write).
 */
import type { Kysely, } from "kysely";
import { createAsset, linkAsset, } from "../assets/service";
import { checkChatAccess, } from "../chat/service";
import { loadConfig, } from "../config/load";
import { getDatabase, } from "../db/index";
import type { DB, } from "../db/schema";
import { forbiddenResponse, } from "../routes/http-utils";
import { uid, } from "../utils";
import { generateAmbient, } from "./audio/ambient";
import { registerAudioProviders, } from "./audio/engine";

/** Max scene tags accepted per request. */
const MAX_TAGS = 8;

/** Max track length accepted per request. */
const MAX_SECONDS = 300;

interface AmbientGenBody {
  /** Scene tags (forest, night, rain, ...) — at least one required. */
  tags?: string[];
  /** Track length in seconds (default 30). */
  duration_sec?: number;
  /** Layer intensity 0..1 (default 0.5). */
  intensity?: number;
  /** Scene mood word injected into the layer prompt. */
  mood?: string;
  /** Generation seed. */
  seed?: number;
  /** Audio provider id (default: first configured ComfyUI, else local). */
  provider?: string;
  /** Chat the track belongs to; linkage requires access. */
  chatId?: string;
  /** Message the track belongs to; linkage requires access. */
  messageId?: string;
}

/**
 * @param body - Request body
 * @param database - DB handle (defaults to the process database)
 * @param userId - Authenticated user
 * @param userRole
 * @returns The asset payload, or an { error, status } JSON response.
 */
export async function handleAmbientGeneration(
  body: unknown,
  database?: Kysely<DB>,
  userId?: string,
  userRole?: string | null,
): Promise<Response> {
  if (!userId) {
    return Response.json({ error: "Authentication required", status: 401, }, { status: 401, },);
  }

  const req = body as AmbientGenBody;

  const db = database ?? getDatabase();
  let resolvedChatId = req.chatId;
  if (req.messageId) {
    const msg = await db.selectFrom("messages",).select("chat_id",).where("id", "=", req.messageId,).executeTakeFirst();
    if (!msg) { return Response.json({ error: "Message not found", status: 404, }, { status: 404, },); }
    if (resolvedChatId && msg.chat_id !== resolvedChatId) {
      return Response.json({ error: "Message does not belong to chat", status: 400, }, { status: 400, },);
    }

    resolvedChatId = resolvedChatId ?? msg.chat_id;
  }

  if (resolvedChatId) {
    const access = await checkChatAccess(db, resolvedChatId, userId, userRole,);
    if (!access.ok) { return forbiddenResponse(); }
  }

  const tags = (req.tags ?? []).filter((t,): t is string => typeof t === "string" && t.trim().length > 0);
  if (tags.length === 0 || tags.length > MAX_TAGS) {
    return Response.json(
      { error: `tags must list 1..${MAX_TAGS} non-empty scene tags`, status: 400, },
      { status: 400, },
    );
  }

  const durationSec = req.duration_sec ?? 30;
  if (!Number.isFinite(durationSec,) || durationSec < 1 || durationSec > MAX_SECONDS) {
    return Response.json(
      { error: `duration_sec must be 1..${MAX_SECONDS}`, status: 400, },
      { status: 400, },
    );
  }

  if (req.intensity !== undefined && (!Number.isFinite(req.intensity,) || req.intensity < 0 || req.intensity > 1)) {
    return Response.json({ error: "intensity must be 0..1", status: 400, }, { status: 400, },);
  }

  const config = loadConfig();
  // Idempotent: registers "local" plus any configured ComfyUI provider.
  registerAudioProviders(config,);

  let outcome;
  try {
    outcome = await generateAmbient({
      tags,
      durationSec,
      intensity: req.intensity,
      mood: typeof req.mood === "string" ? req.mood.slice(0, 200,) : undefined,
      seed: req.seed,
      provider: req.provider,
    },);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error,);
    return Response.json({ error: message, status: 400, }, { status: 400, },);
  }

  if (!outcome.ok) {
    return Response.json(
      { error: outcome.error, status: outcome.status, },
      { status: outcome.status, },
    );
  }

  const assetId = uid();
  const filename = `ambient-${assetId.slice(0, 8,)}.wav`;
  const { asset, } = await createAsset({
    database: db,
    input: {
      ownerId: userId,
      filename,
      mimeType: outcome.mimeType,
      assetType: "audio",
      sizeBytes: outcome.buffer.length,
      buffer: outcome.buffer,
      altText: `Ambient scene audio: ${outcome.layers.map((l,) => l.tag).join(", ",)}`,
      dedupe: false,
    },
    uploadDir: config.assets.uploadDir,
  },);

  if (req.messageId) {
    await linkAsset({
      database: db,
      assetId: asset.id,
      link: { entityType: "message", entityId: req.messageId, label: "ambient", },
    },);
  }

  if (resolvedChatId) {
    await linkAsset({
      database: db,
      assetId: asset.id,
      link: { entityType: "chat", entityId: resolvedChatId, label: "ambient", },
    },);
  }

  return Response.json({
    data: {
      id: asset.id,
      url: `/api/assets/${asset.id}/raw`,
      filename: asset.filename,
      mimeType: asset.mime_type,
      seconds: outcome.seconds,
      provider: outcome.providerId,
      layers: outcome.layers,
    },
  },);
}
