// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Emotion-avatar command-action dispatch.
 *
 * The `generate-emotion-avatars` command action POSTs the regenerate route
 * (slot replace) and polls the batch job via `moodStateAvatars`.
 *
 * Kept apart from `dispatch.ts` (the general chat-action router) so each file
 * stays under 250L.
 */

import { apiFetch, } from "../htmx";
import { t, } from "../i18n";
import { jsonBody, } from "../json";
import { log as rootLog, } from "../logger";
import { moodStateAvatars, } from "../mood/avatars";

import type { ActionHandler, } from "./dispatch";

const log = rootLog.child({ module: "chat-actions", },);

/** Emotion-avatar generation actions — the assistant previewed batch, applied on confirm. */
export const emotionAvatarActionHandlers: Record<string, ActionHandler> = {
  "generate-emotion-avatars": async (ctx, payload,) => {
    const actorId = typeof payload?.actorId === "string" ? payload.actorId : "";
    const baseAvatarId = typeof payload?.baseAvatarId === "string" ? payload.baseAvatarId : "";
    if (!actorId || !baseAvatarId) {
      log.warn("generate-emotion-avatars: missing required payload fields", { payload, },);
      return;
    }

    try {
      const res = await apiFetch(`/api/v1/actors/${actorId}/emotion-avatars/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({
          baseAvatarId,
          emotions: Array.isArray(payload?.emotions,) ? payload.emotions as string[] : undefined,
          replace: "slot",
        },),
      },);

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({})) as unknown;
        const message =
          errBody !== null && typeof errBody === "object" && "message" in errBody && typeof errBody.message === "string"
            ? errBody.message
            : t("status.emotionAvatarsStartFailed",);

        ctx.$dispatch?.("show-toast", { type: "error", message, },);

        return;
      }

      const body = await res.json() as unknown;
      const jobId = body !== null && typeof body === "object" && "jobId" in body && typeof body.jobId === "string"
        ? body.jobId
        : null;

      ctx.$dispatch?.("show-toast", { type: "info", message: t("status.emotionAvatarsStarted",), },);
      await moodStateAvatars._pollEmotionJob!.call(ctx as never, actorId, jobId,);
    } catch {
      ctx.$dispatch?.("show-toast", { type: "error", message: t("status.emotionAvatarsStartFailed",), },);
    }
  },
};
