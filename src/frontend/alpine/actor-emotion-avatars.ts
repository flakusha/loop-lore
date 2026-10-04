// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 290

// ── Character-scoped emotion avatar batch generation panel.
// Drives:
//   GET    /api/v1/actors/:actorId/emotion-avatars/jobs
//   POST   /api/v1/actors/:actorId/emotion-avatars
//   GET    /api/v1/actors/:actorId/emotion-avatars/jobs/:jobId
//   POST   /api/v1/actors/:actorId/emotion-avatars/jobs/:jobId/cancel
// Pairs with `src/components/chat/emotion-avatars-panel.html`.
import type {
  ActorEmotionAvatarsState,
  EmotionAvatarJob,
} from "./actor-emotion-avatars-types";
import { apiFetch, } from "./htmx";
import { t, } from "./i18n";
import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";

export type {
  ActorEmotionAvatarsState,
  EmotionAvatarJob,
  JobStatus,
} from "./actor-emotion-avatars-types";

const log = rootLog.child({ module: "actor-emotion-avatars", },);

const emptySelection = (): string[] => [];

export const actorEmotionAvatars: ActorEmotionAvatarsState = {
  _eaActorId: null,
  jobs: [],
  jobsLoading: false,
  jobsError: "",
  baseAvatarId: "",
  selectedEmotions: emptySelection(),
  promptPrefix: "",
  negativePrompt: "",
  busy: false,
  message: "",
  error: "",
  pollIntervalMs: 2_000,
  _pollHandle: null,
  _pollInterval: null,

  setActorId(actorId: string,) {
    if (this._eaActorId === actorId) { return; }
    this._eaActorId = actorId;
    this.jobs = [];
    this.jobsError = "";
    this.baseAvatarId = "";
    this.selectedEmotions = emptySelection();
    this.promptPrefix = "";
    this.negativePrompt = "";
    this.busy = false;
    this.message = "";
    this.error = "";
    this.stopPolling();
  },

  isJobActive(job: EmotionAvatarJob,) {
    return job.status === "queued" || job.status === "running";
  },

  async listJobs() {
    const actorId = this._eaActorId;
    if (!actorId) { return; }
    this.jobsLoading = true;
    this.jobsError = "";
    try {
      const res = await apiFetch(`/api/v1/actors/${actorId}/emotion-avatars/jobs`, {},);
      if (!res.ok) {
        this.jobsError = t("status.emotionAvatarsLoadFailed",);
        return;
      }

      const body = (await res.json()) as { data?: EmotionAvatarJob[] } | EmotionAvatarJob[];
      this.jobs = Array.isArray(body,) ? body : (body.data ?? []);
    } catch (error) {
      log.error("Failed to list emotion avatar jobs", error instanceof Error ? error : undefined, {},);
      this.jobsError = t("status.emotionAvatarsLoadFailed",);
    } finally {
      this.jobsLoading = false;
    }
  },

  toggleEmotion(emotion: string,) {
    const i = this.selectedEmotions.indexOf(emotion,);
    if (i >= 0) { this.selectedEmotions.splice(i, 1,); }
    else { this.selectedEmotions.push(emotion,); }
  },

  async startGeneration() {
    const actorId = this._eaActorId;
    if (!actorId || this.busy) { return false; }
    if (!this.baseAvatarId.trim()) {
      this.error = t("status.emotionAvatarsBaseRequired",);
      return false;
    }

    this.busy = true;
    this.error = "";
    this.message = "";
    try {
      const res = await apiFetch(`/api/v1/actors/${actorId}/emotion-avatars`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({
          baseAvatarId: this.baseAvatarId.trim(),
          emotions: this.selectedEmotions,
          promptPrefix: this.promptPrefix || undefined,
          negativePrompt: this.negativePrompt || undefined,
        },),
      },);

      if (!res.ok) {
        const body = await res.json().catch(() => ({} as Record<string, unknown>)) as {
          message?: string;
        };

        this.error = body.message ?? t("status.emotionAvatarsStartFailed",);
        return false;
      }

      this.message = t("status.emotionAvatarsStarted",);
      await this.listJobs();
      this.startPolling();
      return true;
    } catch (error) {
      log.error("Failed to start emotion avatar generation", error instanceof Error ? error : undefined, {},);
      this.error = t("status.emotionAvatarsStartFailed",);
      return false;
    } finally {
      this.busy = false;
    }
  },

  async cancelJob(jobId: string,) {
    const actorId = this._eaActorId;
    if (!actorId || this.busy || !jobId) { return; }
    this.busy = true;
    this.error = "";
    try {
      const res = await apiFetch(
        `/api/v1/actors/${actorId}/emotion-avatars/jobs/${jobId}/cancel`,
        { method: "POST", },
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({} as Record<string, unknown>)) as {
          message?: string;
        };

        this.error = body.message ?? t("status.emotionAvatarsCancelFailed",);
        return;
      }

      await this.refreshJob(jobId,);
      this.stopPolling();
      await this.listJobs();
      this.startPolling();
    } catch (error) {
      log.error("Failed to cancel emotion avatar job", error instanceof Error ? error : undefined, {},);
      this.error = t("status.emotionAvatarsCancelFailed",);
    } finally {
      this.busy = false;
    }
  },

  async refreshJob(jobId: string,) {
    const actorId = this._eaActorId;
    if (!actorId || !jobId) { return; }
    try {
      const res = await apiFetch(
        `/api/v1/actors/${actorId}/emotion-avatars/jobs/${jobId}`,
        {},
      );

      if (!res.ok) { return; }
      const job = (await res.json()) as EmotionAvatarJob;
      const idx = this.jobs.findIndex((j,) => j.id === job.id);
      if (idx >= 0) { this.jobs.splice(idx, 1, job,); }
      else { this.jobs.push(job,); }
    } catch (error) {
      log.error("Failed to refresh emotion avatar job", error instanceof Error ? error : undefined, {},);
    }
  },

  startPolling() {
    this.stopPolling();
    const tick = async () => {
      const active = this.jobs.filter(this.isJobActive,);
      if (active.length === 0) {
        this.stopPolling();
        return;
      }

      for (const job of active) { await this.refreshJob(job.id,); }
      const stillActive = this.jobs.some(this.isJobActive,);
      if (!stillActive) { this.stopPolling(); }
    };

    this._pollInterval = setInterval(() => {
      void tick();
    }, this.pollIntervalMs,);

    this._pollHandle = setTimeout(() => {
      // First tick fires sooner so the UI updates without waiting for the
      // full interval; the interval handle keeps polling alive.
      void tick();
    }, 100,);
  },

  stopPolling() {
    if (this._pollHandle) {
      clearTimeout(this._pollHandle,);
      this._pollHandle = null;
    }

    if (this._pollInterval) {
      clearInterval(this._pollInterval,);
      this._pollInterval = null;
    }
  },
};

/** Build the Alpine scope for the emotion avatars panel. */
export function actorEmotionAvatarsFactory(actorId: string,): ActorEmotionAvatarsState {
  const state = Object.create(actorEmotionAvatars,) as ActorEmotionAvatarsState;
  state._eaActorId = null;
  state.jobs = [];
  state.jobsLoading = false;
  state.jobsError = "";
  state.baseAvatarId = "";
  state.selectedEmotions = emptySelection();
  state.promptPrefix = "";
  state.negativePrompt = "";
  state.busy = false;
  state.message = "";
  state.error = "";
  state._pollHandle = null;
  state._pollInterval = null;
  state.setActorId(actorId,);
  void state.listJobs();
  state.startPolling();
  return state;
}

(globalThis as Record<string, unknown>).actorEmotionAvatarsFactory = actorEmotionAvatarsFactory;
(globalThis as Record<string, unknown>).actorEmotionAvatars = actorEmotionAvatars;
