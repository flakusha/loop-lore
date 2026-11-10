// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * POST /api/v1/generation/audio — generate one audio track from a text prompt.
 *
 * Backs the `/sfx` and `/music` assistant commands: the command returns an
 * action, the frontend posts it here, and the track is persisted as an audio
 * asset linked to the requesting chat/message.
 *
 * Authorization mirrors the ambient route (BUG-generation-control-plane-routes-
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
import { generateAudio, registerAudioProviders, resolveAudioProvider, } from "./audio/engine";

/** Max prompt length accepted per request. */
const MAX_PROMPT = 2_000;

/** Max track length accepted per request. */
const MAX_SECONDS = 300;

/** Default track length when the caller does not ask for one. */
const DEFAULT_SECONDS = 30;

interface AudioGenBody {
  /** Natural-language prompt for the audio model. */
  prompt?: string;
  /** Track length in seconds (default 30). */
  seconds?: number;
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
 * Generate one audio track from a prompt and persist it as an asset.
 * @param body - Request body
 * @param database
 * @param userId
 * @param userRole
 * @returns The generated asset, or an error response.
 */
export async function handleAudioGeneration(
  body: unknown,
  database?: Kysely<DB>,
  userId?: string,
  userRole?: string | null,
): Promise<Response> {
  if (!userId) {
    return Response.json({ error: "Authentication required", status: 401, }, { status: 401, },);
  }

  const req = body as AudioGenBody;
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

  const prompt = typeof req.prompt === "string" ? req.prompt.trim() : "";
  if (!prompt || prompt.length > MAX_PROMPT) {
    return Response.json(
      { error: `prompt must be 1..${MAX_PROMPT} characters`, status: 400, },
      { status: 400, },
    );
  }

  const seconds = req.seconds ?? DEFAULT_SECONDS;
  if (!Number.isFinite(seconds,) || seconds < 1 || seconds > MAX_SECONDS) {
    return Response.json(
      { error: `seconds must be 1..${MAX_SECONDS}`, status: 400, },
      { status: 400, },
    );
  }

  const config = loadConfig();
  // Idempotent: registers "local" plus any configured ComfyUI provider.
  registerAudioProviders(config,);

  const resolved = resolveAudioProvider({ provider: req.provider, },);
  if (!resolved.ok) {
    return Response.json({ error: resolved.error, status: resolved.status, }, { status: resolved.status, },);
  }

  // "local" is a procedural texture bank, not a prompt model: a prompt-driven
  // request needs an operator-configured audio provider. The ambient route
  // stays the procedural path.
  if (resolved.provider.id === "local") {
    return Response.json(
      {
        error: "No audio provider configured — add a ComfyUI audio workflow under generation.providers.audio",
        status: 501,
      },
      { status: 501, },
    );
  }

  const outcome = await generateAudio({
    request: {
      prompt,
      seconds: Math.round(seconds,),
      seed: typeof req.seed === "number" && Number.isFinite(req.seed,) ? req.seed : undefined,
    },
    provider: req.provider,
  },);

  if (!outcome.ok) {
    return Response.json(
      { error: outcome.error, status: outcome.status, },
      { status: outcome.status, },
    );
  }

  const assetId = uid();
  const filename = `audio-${assetId.slice(0, 8,)}.wav`;
  const { asset, } = await createAsset({
    database: db,
    input: {
      ownerId: userId,
      filename,
      mimeType: outcome.mimeType,
      assetType: "audio",
      sizeBytes: outcome.buffer.length,
      buffer: outcome.buffer,
      altText: `Generated audio: ${prompt}`,
      dedupe: false,
    },
    uploadDir: config.assets.uploadDir,
  },);

  if (req.messageId) {
    await linkAsset({
      database: db,
      assetId: asset.id,
      link: { entityType: "message", entityId: req.messageId, label: "audio", },
    },);
  }

  if (resolvedChatId) {
    await linkAsset({
      database: db,
      assetId: asset.id,
      link: { entityType: "chat", entityId: resolvedChatId, label: "audio", },
    },);
  }

  return Response.json({
    data: {
      id: asset.id,
      url: `/api/v1/assets/${asset.id}/raw`,
      filename: asset.filename,
      mimeType: asset.mime_type,
      seconds: Math.round(seconds,),
      provider: resolved.provider.id,
    },
  },);
}
