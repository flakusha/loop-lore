// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Frontend handlers for the audio actions: prompt-driven sound-effect and
 * music generation (both POST /api/v1/generation/audio) and the external
 * music link, which reuses the chat's music-links flow.
 */

import { t, } from "../i18n";
import type { ChatState, } from "../types";
import { type DispatchCtx, dispatchGenerationAction, } from "./generation-helpers";

export type AudioActionHandler = (
  ctx: DispatchCtx & Partial<ChatState>,
  payload: Record<string, unknown> | null,
  chatId: string,
) => Promise<void> | void;

export const audioActionHandlers: Record<string, AudioActionHandler> = {
  "generate-sfx": async (ctx, payload, chatId,) => {
    await dispatchGenerationAction(
      ctx,
      "/api/v1/generation/audio",
      { prompt: (payload?.prompt as string) ?? "", seconds: (payload?.seconds as number) ?? 6, chatId, },
      "Sound effect generation",
      chatId,
    );
  },

  "generate-music": async (ctx, payload, chatId,) => {
    await dispatchGenerationAction(
      ctx,
      "/api/v1/generation/audio",
      { prompt: (payload?.prompt as string) ?? "", seconds: (payload?.seconds as number) ?? 30, chatId, },
      "Music generation",
      chatId,
    );
  },

  "link-music": async (ctx, payload,) => {
    const url = (payload?.url as string) ?? "";
    if (!url) {
      ctx.$dispatch?.("show-toast", {
        type: "warning",
        message: t("toasts.actionNoInput", { action: "music link", },),
      },);

      return;
    }

    // Reuse the music-links panel flow: it posts the link and refreshes the list.
    ctx._musicLinkUrl = url;
    await ctx.addMusicLink?.();
    if (ctx._musicLinkError) {
      ctx.$dispatch?.("show-toast", { type: "error", message: ctx._musicLinkError, },);
    }
  },
};
