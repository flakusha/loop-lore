// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Character-detail emotion avatar panel.
// Drives the actor-scoped emotion avatar batch endpoints:
//   GET  /api/actors/:actorId/emotion-avatars/jobs
//   GET  /api/actors/:actorId/emotion-avatars/jobs/:jobId
//   POST /api/actors/:actorId/emotion-avatars
//   POST /api/actors/:actorId/emotion-avatars/jobs/:jobId/cancel
// Pairs with `src/components/chat/emotion-avatars-panel.html`; the chat-scoped
// generation flow lives in `mood/avatars.ts` and is unaffected.
import { EmotionType, } from "../../db/enums-character/avatar";
import { apiFetch, } from "./htmx";
import { t, } from "./i18n";
import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";

const log = rootLog.child({ module: "actor-emotion-avatars", },);

/** A single batch job returned by the listing endpoint. */
export interface EmotionAvatarJob {
  id: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  progress: number;
  total: number;
  emotions: string[];
  createdAt: string;
  completedAt: string | null;
  error: string | null;
}

/** The complete set of emotions offered by the type catalog endpoint. */
export const ALL_EMOTIONS: string[] = Object.values(EmotionType,);

/** Job terminal statuses (membership check via TERMINAL_STATUSES[status]). */
const TERMINAL_STATUSES: Record<string, true> = {
  completed: true,
  failed: true,
  cancelled: true,
};

/** Job status → human label map. */
const TERMINAL_STATUS_TEXT: Record<string, string> = {
  completed: t("status.emotionJobCompleted",),
  failed: t("status.emotionJobFailed",),
  cancelled: t("status.emotionJobCancelled",),
};

/** Browser-side setInterval handle (number in Node/Bun, Timer in some others). */
type IntervalHandle = ReturnType<typeof setInterval>;

/**
 * State plugin for the character-detail emotion-avatar panel.
 * Bound to a single actor via `setActorId`; lists prior jobs and starts
 * a new batch from a chosen emotion subset. Does NOT assume an `activeChat`.
 */
export interface ActorEmotionAvatarsState {
  _emAvatarActorId: string | null;
  _emAvatarJobs: EmotionAvatarJob[];
  _emAvatarJobsLoading: boolean;
  _emAvatarSelected: string[];
  _emAvatarBaseId: string;
  _emAvatarBusy: boolean;
  _emAvatarError: string;
  _emAvatarPolling: IntervalHandle | null;
  /** Bind the panel to a specific actor. Resets jobs and selection. */
  setActorId(actorId: string,): void;
  /** Fetch the list of recent jobs for the bound actor. */
  loadJobs(): Promise<void>;
  /** Toggle an emotion in/out of the selection. */
  toggleEmotion(emotion: string,): void;
  /** Select the full default set (used by "All" affordance). */
  selectAll(): void;
  /** Clear the current selection. */
  clearSelection(): void;
  /** Start a batch job for the current selection. Polls until terminal. */
  startBatch(): Promise<void>;
  /** Cancel a running job by id. */
  cancelJob(jobId: string,): Promise<void>;
  /** Poll a single running job. Returns the job on success, null on error. */
  _pollJobOnce(jobId: string,): Promise<EmotionAvatarJob | null>;
  /** Start polling for a specific job. */
  _startPolling(jobId: string,): void;
  /** Stop any active poll loop. Called from the panel teardown. */
  stopPolling(): void;
  /** Read the human-readable status text for a single job row. */
  describeStatus(job: EmotionAvatarJob,): string;
}

export const actorEmotionAvatars: ActorEmotionAvatarsState = {
  _emAvatarActorId: null,
  _emAvatarJobs: [],
  _emAvatarJobsLoading: false,
  _emAvatarSelected: [],
  _emAvatarBaseId: "",
  _emAvatarBusy: false,
  _emAvatarError: "",
  _emAvatarPolling: null,

  setActorId(actorId: string,) {
    if (this._emAvatarActorId === actorId) { return; }
    this.stopPolling();
    this._emAvatarActorId = actorId;
    this._emAvatarJobs = [];
    this._emAvatarSelected = [];
    this._emAvatarError = "";
    void this.loadJobs();
  },

  async loadJobs() {
    const actorId = this._emAvatarActorId;
    if (!actorId) { return; }
    this._emAvatarJobsLoading = true;
    try {
      const res = await apiFetch(`/api/actors/${actorId}/emotion-avatars/jobs`,);
      if (!res.ok) { return; }
      const body = (await res.json()) as { jobs?: EmotionAvatarJob[] };
      this._emAvatarJobs = Array.isArray(body.jobs,) ? body.jobs : [];
    } catch (error) {
      log.error("Failed to load emotion-avatar jobs", error instanceof Error ? error : undefined, {},);
      this._emAvatarError = t("status.emotionJobsLoadFailed",);
    } finally {
      this._emAvatarJobsLoading = false;
    }
  },

  toggleEmotion(emotion: string,) {
    const idx = this._emAvatarSelected.indexOf(emotion,);
    if (idx >= 0) {
      this._emAvatarSelected.splice(idx, 1,);
    } else {
      this._emAvatarSelected.push(emotion,);
    }
  },

  selectAll() {
    this._emAvatarSelected = [...ALL_EMOTIONS,];
  },

  clearSelection() {
    this._emAvatarSelected = [];
  },

  async startBatch() {
    const actorId = this._emAvatarActorId;
    if (!actorId || this._emAvatarBusy) { return; }
    if (!this._emAvatarBaseId) {
      this._emAvatarError = t("status.emotionBatchNoBase",);
      return;
    }
    if (this._emAvatarSelected.length === 0) {
      this._emAvatarError = t("status.emotionBatchNoSelection",);
      return;
    }
    this._emAvatarBusy = true;
    this._emAvatarError = "";
    try {
      const res = await apiFetch(`/api/actors/${actorId}/emotion-avatars`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({
          baseAvatarId: this._emAvatarBaseId,
          emotions: this._emAvatarSelected,
        },),
      },);
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as Record<string, unknown>)) as {
          message?: string;
        };
        this._emAvatarError = body.message ?? t("status.emotionBatchStartFailed",);
        return;
      }
      const { jobId, } = (await res.json()) as { jobId?: string };
      if (jobId) {
        await this.loadJobs();
        this._startPolling(jobId,);
      }
    } catch (error) {
      log.error("Failed to start emotion-avatar batch", error instanceof Error ? error : undefined, {},);
      this._emAvatarError = t("status.emotionBatchStartFailed",);
    } finally {
      this._emAvatarBusy = false;
    }
  },

  async cancelJob(jobId: string,) {
    const actorId = this._emAvatarActorId;
    if (!actorId) { return; }
    try {
      const res = await apiFetch(`/api/actors/${actorId}/emotion-avatars/jobs/${jobId}/cancel`, {
        method: "POST",
      },);
      if (!res.ok) { return; }
      await this.loadJobs();
    } catch (error) {
      log.error("Failed to cancel emotion-avatar job", error instanceof Error ? error : undefined, {},);
    }
  },

  async _pollJobOnce(jobId: string,) {
    const actorId = this._emAvatarActorId;
    if (!actorId) { return null; }
    try {
      const res = await apiFetch(`/api/actors/${actorId}/emotion-avatars/jobs/${jobId}`,);
      if (!res.ok) { return null; }
      const job = (await res.json()) as EmotionAvatarJob;
      await this.loadJobs();
      return job;
    } catch (error) {
      log.error("Failed to poll emotion-avatar job", error instanceof Error ? error : undefined, { jobId, },);
      return null;
    }
  },

  _startPolling(jobId: string,) {
    this.stopPolling();
    this._emAvatarPolling = setInterval(() => {
      void this._pollJobOnce(jobId,).then((job,) => {
        if (job && TERMINAL_STATUSES[job.status]) {
          this.stopPolling();
        }
      },);
    }, 2000,);
  },

  stopPolling() {
    if (this._emAvatarPolling) {
      clearInterval(this._emAvatarPolling,);
      this._emAvatarPolling = null;
    }
  },

  describeStatus(job: EmotionAvatarJob,) {
    const label = TERMINAL_STATUS_TEXT[job.status];
    if (label) { return label; }
    const pct = job.total > 0 ? Math.round((job.progress / job.total) * 100,) : 0;
    return `${pct}%`;
  },
};

/** Build the reactive Alpine scope used by the emotion-avatars-panel partial.
 * Usage: `<section x-data="actorEmotionAvatarsFactory(actorId)">`. The factory
 * clones the plugin state and binds to the provided actor id at init. */
export function actorEmotionAvatarsFactory(actorId: string,): ActorEmotionAvatarsState {
  const state = Object.create(actorEmotionAvatars,) as ActorEmotionAvatarsState;
  state._emAvatarActorId = null;
  state._emAvatarJobs = [];
  state._emAvatarSelected = [];
  state._emAvatarBaseId = "";
  state._emAvatarBusy = false;
  state._emAvatarError = "";
  state._emAvatarPolling = null;
  state.setActorId(actorId,);
  return state;
}

(globalThis as Record<string, unknown>).actorEmotionAvatarsFactory = actorEmotionAvatarsFactory;
