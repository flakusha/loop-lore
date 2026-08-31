// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { apiFetch, } from "./../htmx";
import { t, } from "./../i18n";
import { jsonBody, } from "./../json";
import { log as rootLog, } from "./../logger";
import type { ChatState, } from "./../types";

const log = rootLog.child({ module: "mood", },);

export const moodStateAvatars: Partial<ChatState> & ThisType<ChatState> = {
  async loadEmotionAvatars() {
    if (!this.activeChat) { return; }
    this._emotionAvatarsLoading = true;
    try {
      const res = await apiFetch(`/api/v1/chats/${this.activeChat}/participants`,);
      if (!res.ok) { return; }
      const participants = await res.json();
      const npc = Array.isArray(participants,)
        ? participants.find((p: any,) => p.role_in_chat === "member" && p.actor_type !== "user")
        : null;
      if (!npc?.actor_id) { return; }

      const avatarsRes = await apiFetch(`/api/actors/${npc.actor_id}/avatars`,);
      if (avatarsRes.ok) {
        const avatars = await avatarsRes.json();
        const emotionAvatars: { emotion: string; avatarId: string; assetId: string }[] = [];
        for (const a of avatars) {
          if (a.tags?.emotion) {
            emotionAvatars.push({
              emotion: a.tags.emotion,
              avatarId: a.id,
              assetId: a.asset_id,
            },);
          }
        }
        this._emotionAvatars = emotionAvatars;

        // Select the avatar matching current mood
        if (this._mood) {
          this._currentEmotionAvatar = this.selectEmotionAvatar(this._mood.currentMood,);
        }
      }
    } catch (error) {
      log.error("Failed to load emotion avatars", error instanceof Error ? error : undefined, {},);
    } finally {
      this._emotionAvatarsLoading = false;
    }
  },

  async generateEmotionAvatars() {
    if (!this.activeChat || this._emotionGenRunning) { return; }
    try {
      const res = await apiFetch(`/api/v1/chats/${this.activeChat}/participants`,);
      if (!res.ok) { return; }
      const participants = await res.json();
      const npc = Array.isArray(participants,)
        ? participants.find((p: any,) => p.role_in_chat === "member" && p.actor_type !== "user")
        : null;
      if (!npc?.actor_id) { return; }

      const baseAvatarId = this.currentCharacter?.avatar_asset_id ?? null;
      if (!baseAvatarId) {
        this._emotionGenStatus = t("status.noBaseAvatar",);
        return;
      }

      this._emotionGenRunning = true;
      this._emotionGenStatus = t("status.startingGeneration",);
      try {
        const genRes = await apiFetch(`/api/actors/${npc.actor_id}/emotion-avatars`, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({ baseAvatarId, },),
        },);
        let genBody: { message?: string; jobId?: string | null } = {};
        try {
          genBody = (await genRes.json()) as { message?: string; jobId?: string | null };
        } catch { /* non-JSON error body */ }
        if (!genRes.ok) {
          this._emotionGenStatus = genBody.message ?? t("status.generationFailedToStart",);
          return;
        }
        this._emotionGenJobId = genBody.jobId ?? null;
        this._emotionGenStatus = t("status.generatingEmotionAvatars",);
        await this._pollEmotionJob(npc.actor_id, this._emotionGenJobId,);
      } finally {
        this._emotionGenRunning = false;
      }
    } catch (error) {
      log.error("Failed to start emotion avatar generation", error instanceof Error ? error : undefined, {},);
      this._emotionGenStatus = t("status.failedToStartGeneration",);
      this._emotionGenRunning = false;
    }
  },

  async _pollEmotionJob(actorId: string, jobId: string | null,) {
    if (!jobId) {
      this._emotionGenStatus = t("status.generationNoJobId",);
      return;
    }
    const deadline = Date.now() + 5 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise((resolve,) => setTimeout(resolve, 2000,));
      try {
        const res = await apiFetch(`/api/actors/${actorId}/emotion-avatars/jobs/${jobId}`,);
        if (!res.ok) { continue; }
        const job = await res.json();
        const status = job.status as string;
        if (status === "completed") {
          this._emotionGenStatus = t("status.emotionAvatarsGenerated",);
          await this.loadEmotionAvatars();
          return;
        }
        if (status === "failed" || status === "cancelled") {
          this._emotionGenStatus = t("status.generationOutcome", { status, },);
          return;
        }
      } catch { /* keep polling */ }
    }
    this._emotionGenStatus = t("status.generationTimedOut",);
  },

  /**
   * Resolve the avatar asset for a single assistant message based on its
   * detected emotion. Emotion avatars are bound per message (and per chat's
   * current character), not globally. Falls back to the character's base
   * avatar when the message has no emotion or no matching variant exists.
   * @param msg - The message being rendered
   * @param msg.role
   * @param msg.emotion
   * @returns Asset id to display, or null to hide the avatar
   */
  avatarForMessage(msg: { role?: string; emotion?: string | null },): string | null {
    if (msg.role === "user") { return null; }
    if (msg.emotion) {
      // Pure per-message lookup (does NOT mutate the mood-driven global
      // _currentEmotionAvatar, which stays for non-message avatar areas).
      const exact = this._emotionAvatars.find((a,) => a.emotion === msg.emotion);
      if (exact) { return exact.assetId; }
      const neutral = this._emotionAvatars.find((a,) => a.emotion === "neutral");
      if (neutral) { return neutral.assetId; }
      if (this._emotionAvatars[0]) { return this._emotionAvatars[0].assetId; }
    }
    return this.currentCharacter?.avatar_asset_id ?? null;
  },

  /**
   * Select the best emotion avatar for the given emotion.
   * Returns the asset ID or null if no matching avatar found.
   * @param emotion
   */
  selectEmotionAvatar(emotion: string,): string | null {
    if (this._emotionAvatars.length === 0) { return null; }

    // Exact match first
    const exact = this._emotionAvatars.find((a,) => a.emotion === emotion);
    if (exact) {
      this._currentEmotionAvatar = exact.assetId;
      return exact.assetId;
    }

    // Fallback to neutral
    const neutral = this._emotionAvatars.find((a,) => a.emotion === "neutral");
    if (neutral) {
      this._currentEmotionAvatar = neutral.assetId;
      return neutral.assetId;
    }

    // Fallback to first available
    const first = this._emotionAvatars[0];
    if (first) {
      this._currentEmotionAvatar = first.assetId;
      return first.assetId;
    }

    return null;
  },
};
