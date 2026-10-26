// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Voice-note upload route (TASK-voice-notes-playback).
 *
 * POST /api/v1/chats/:id/voice-notes — multipart audio-only upload for chat
 * voice notes. Delegates storage to the asset pipeline (`handleUpload`),
 * gated to an audio-mime allowlist and a 5MB cap (422 on violation). The
 * returned asset id is attached client-side via the message create/attach
 * flow with `label: "voice-note"`; inline `<audio>` playback already exists
 * in the message bubble (`media-voice`).
 */
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import { handleUpload, } from "../assets/controller";
import { checkChatAccess, } from "../chat/service";
import type { Config, } from "../config/schema";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { HttpStatus, jsonError, requireUserId, } from "./http-utils";

interface HandlerOpts {
  database: Kysely<DB>;
  config: Config;
}

/** MediaRecorder outputs (ogg/webm/mp4) plus common interchange mimes. */
const VOICE_MIME_ALLOWLIST = new Set([
  "audio/ogg",
  "audio/oga",
  "audio/webm",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
],);

const MAX_VOICE_NOTE_BYTES = 5 * 1024 * 1024;

const tChatIdParams = t.Object({ id: t.String(), },);

/**
 * @param opts
 * @param prefix
 */
export function voiceNoteRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, config, } = opts;

  return new Elysia({ name: "voice-notes", },).post(
    `${prefix}/chats/:id/voice-notes`,
    async (ctx,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const chatId = ctx.params.id;

      const access = await checkChatAccess(
        database,
        chatId,
        userId,
        (ctx as { userRole?: string | null }).userRole ?? null,
      );

      if (!access.ok) { return jsonError({ message: "Chat not found", status: HttpStatus.NotFound, },); }

      if (!config.assets.enabled) {
        return jsonError({ message: "Asset system is disabled", status: HttpStatus.NotFound, },);
      }

      const contentType = ctx.request.headers.get("content-type",) ?? "";
      if (!contentType.includes("multipart/form-data",)) {
        return jsonError({ message: "Expected multipart/form-data", status: HttpStatus.BadRequest, },);
      }

      let formData: FormData;
      try {
        formData = await ctx.request.formData();
      } catch (error) {
        getLogger().child({ module: "voice-notes", },).error(
          "Failed to parse voice-note upload",
          error instanceof Error ? error : new Error(String(error,),),
        );

        return jsonError({ message: "Failed to parse upload", status: HttpStatus.BadRequest, },);
      }

      const file = formData.get("file",);
      if (!file || !(file instanceof File)) {
        return jsonError({ message: "file field is required", status: HttpStatus.BadRequest, },);
      }

      const mime = (file.type ?? "").toLowerCase();
      if (!VOICE_MIME_ALLOWLIST.has(mime,)) {
        return jsonError({
          message: `Unsupported voice-note type: ${mime || "unknown"}`,
          status: HttpStatus.UnprocessableEntity,
        },);
      }

      if (file.size > MAX_VOICE_NOTE_BYTES) {
        return jsonError({
          message: `Voice note too large (max ${MAX_VOICE_NOTE_BYTES} bytes)`,
          status: HttpStatus.UnprocessableEntity,
        },);
      }

      // Delegate storage to the asset pipeline: rebuild the multipart body so
      // handleUpload owns dedup, hashing, storage and chat encryption while
      // this route owns the voice-specific gate above. No content-type header
      // is copied — the Request constructor serializes FormData with a fresh
      // boundary (the original header's boundary is already consumed).
      const rebuilt = new Request("https://voice-notes.local/upload", {
        method: "POST",
        body: formData,
      },);

      return handleUpload({
        request: rebuilt,
        userId,
        database,
        uploadDir: config.assets.uploadDir,
        maxFileSize: MAX_VOICE_NOTE_BYTES,
        chatId,
        config,
      },);
    },
    {
      params: tChatIdParams,
      parse: "none",
      detail: {
        summary: "Upload a chat voice note",
        description:
          "Audio-only multipart upload (allowlisted audio mimes, 5MB cap; violations → 422). Returns the stored asset id for the message attach flow.",
        tags: ["Chats", "Voice notes",],
      },
    },
  );
}
