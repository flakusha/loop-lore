// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat generation polling logic — recovery status poll and preferred-mode send.
 *
 * Extracted from chat-generations.ts; methods are merged into the
 * chatGenerations object at call time, so `this` still resolves to the
 * full ChatState.
 */

import type {
  ChatState,
} from "./types";

import {
  apiFetch,
} from "./htmx";

import {
  log as rootLog,
} from "./logger";

import {
  trackTelemetry,
} from "./telemetry";

const log = rootLog.child({ module: "chat", },);

export const chatGenerationPolling: Partial<ChatState> & ThisType<ChatState> = {
  /**
   * @param {string} chatId
   * @returns {Promise<void>}
   */
  async checkGenerationStatus(chatId: string,) {
    log.debug("checkGenerationStatus", {
      chatId,
    },);

    try {
      const response = await apiFetch(`/api/v1/generation/status/${chatId}`,);

      const data = await response.json();

      const hadActiveAttempt = !!this.activeAttemptId;

      if (data.isActive) {
        this.isGenerating = true;

        this.activeAttemptId = data.attemptId;

        this.generationDetail = data.generation
          ? {
            attemptId: data.generation.attemptId,
            status: data.generation.status,
            elapsedMs: data.generation.elapsedMs,
            chunksReceived: data.generation.chunksReceived,
            charsReceived: data.generation.charsReceived,
          }
          : null;

        const detail = this.generationDetail;

        if (detail) {
          const elapsed = detail.elapsedMs ? ` (${Math.round(Number(detail.elapsedMs,) / 1000,)}s)` : "";

          const chars = detail.charsReceived ? ` · ${detail.charsReceived} chars` : "";

          this.generationLabel = `Generating${elapsed}${chars}`;
        }
      } else if (hadActiveAttempt) {
        trackTelemetry("generation.completed", {
          chatId,
        },);

        this.isGenerating = false;

        this.activeAttemptId = null;

        this.generationDetail = null;

        await this.loadMessages();
      } else if (!this.isGenerating) {
        this.activeAttemptId = null;

        this.generationDetail = null;
      }
    } catch (error) {
      // Recovery poll is best-effort; surface the reason instead of swallowing it.
      log.debug("checkGenerationStatus failed", {
        chatId,
        error: String(error,),
      },);
    }
  },
  /**
   * @param {string} chatId
   * @param {() => void} onDone
   * @returns {Promise<void>}
   */
  async sendWithPreferredMode(chatId: string, onDone?: () => void,) {
    const pref = this.getStreamPreference?.(chatId,) ?? this._streamResponses !== false;

    if (pref) {
      this.connectGenerationSSE(chatId,);

      return;
    }

    const end = Date.now() + 30_000;

    do {
      await this.checkGenerationStatus(chatId,);

      if (!this.isGenerating || Date.now() >= end) {
        break;
      }

      await new Promise<void>((resolve,) => {
        setTimeout(resolve, 1000,);
      },);
    } while (Date.now() < end);

    await this.loadMessages();

    onDone?.();
  },
};
