// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { apiFetch, } from "./../htmx";
import { t, } from "./../i18n";
import { jsonBody, } from "./../json";
import { log as rootLog, } from "./../logger";
import type { ChatState, } from "./../types";
import { emotionVariantsOf, pickEmotionAsset, } from "./emotion-variants";

const log = rootLog.child({ module: "mood", },);

export type { EmotionVariant, } from "./emotion-variants";
export { emotionVariantsOf, pickEmotionAsset, } from "./emotion-variants";

export const moodStateAvatars: Partial<ChatState> & ThisType<ChatState> = {
  /**
   * @returns {Promise<void>}
   */
  async loadEmotionAvatars() {
    if (!this.activeChat) { return; }
    this._emotionAvatarsLoading = true;
    this._emotionAvatarsByActor = {};
    this._actorBaseAvatars = {};
    try {
      const res = await apiFetch(`/api/v1/chats/${this.activeChat}/participants`,);
      if (!res.ok) { return; }
      const participants = await res.json();
      const npcs = Array.isArray(participants,)
        ? participants.filter((p: any,) => p.role_in_chat === "member" && p.actor_type !== "user")
        : [];

      const npc = npcs[0] ?? null;

      if (!npc?.actor_id) { return; }

      // Per-author maps for group chats: every non-user participant resolves
      // its own emotion variants (and base portrait) below, so a message
      // renders its AUTHOR's avatar, not the chat's single current character.
      await Promise.allSettled(npcs.map(async (member: any,) => {
        const id = member.actor_id as string;
        if (typeof member.avatar_asset_id === "string" && member.avatar_asset_id) {
          this._actorBaseAvatars[id] = member.avatar_asset_id;
        }

        try {
          const memberRes = await apiFetch(`/api/v1/actors/${id}/avatars`,);
          if (!memberRes.ok) { return; }
          const rows = await memberRes.json();
          this._emotionAvatarsByActor[id] = emotionVariantsOf(rows,);
        } catch {
          // One author's failure must not cost the other authors their map.
        }
      },),);

      // Direct-chat flat list reuses the first npc's map entry — one fetch
      // serves both paths, and group chats never pay a duplicate request.
      this._emotionAvatars = this._emotionAvatarsByActor[npc.actor_id] ?? [];

      // Select the avatar matching current mood
      if (this._mood) {
        this._currentEmotionAvatar = this.selectEmotionAvatar(this._mood.currentMood,);
      }
    } catch (error) {
      log.error("Failed to load emotion avatars", error instanceof Error ? error : undefined, {},);
    } finally {
      this._emotionAvatarsLoading = false;
    }
  },

  /**
   * @returns {Promise<void>}
   */
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
        const genRes = await apiFetch(`/api/v1/actors/${npc.actor_id}/emotion-avatars`, {
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

  /**
   * @param {string} actorId
   * @param {string | null} jobId
   * @returns {Promise<void>}
   */
  async _pollEmotionJob(actorId: string, jobId: string | null,) {
    if (!jobId) {
      this._emotionGenStatus = t("status.generationNoJobId",);
      return;
    }

    const deadline = Date.now() + 5 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise((resolve,) => setTimeout(resolve, 2000,));
      try {
        const res = await apiFetch(`/api/v1/actors/${actorId}/emotion-avatars/jobs/${jobId}`,);
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
   * Resolve the avatar asset for a single assistant message.
   *
   * `msg.avatar_asset_id` is the server's answer: the message-read path walks
   * the one wardrobe ladder owner (`selectAvatar`), so the header outfit
   * switcher reaches the render. It is absent when no outfit is in play for
   * the message's actor. Next, a message carrying its author actor id
   * (`messages.actor_id`, exposed by the read API) resolves against THAT
   * author's emotion variants, falling back to that author's base portrait —
   * group chats render each speaker's avatar, not the chat's single current
   * character. Messages without a known author keep the legacy flat-list
   * walk (direct chats unchanged).
   * @param msg - The message being rendered
   * @param msg.role
   * @param msg.emotion
   * @param msg.avatar_asset_id - Server-resolved, outfit-aware asset id.
   * @param msg.actor_id - Author actor id; selects the per-actor map.
   * @returns Asset id to display, or null to hide the avatar
   */
  avatarForMessage(msg: {
    role?: string;
    emotion?: string | null;
    avatar_asset_id?: string | null;
    actor_id?: string | null;
  },): string | null {
    if (msg.role === "user") { return null; }
    if (msg.avatar_asset_id) { return msg.avatar_asset_id; }
    const perActor = msg.actor_id ? this._emotionAvatarsByActor?.[msg.actor_id] : undefined;
    if (perActor) {
      return pickEmotionAsset(perActor, msg.emotion,) ??
        (msg.actor_id ? this._actorBaseAvatars?.[msg.actor_id] : undefined) ??
        null;
    }

    return pickEmotionAsset(this._emotionAvatars, msg.emotion,) ??
      this.currentCharacter?.avatar_asset_id ??
      null;
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
