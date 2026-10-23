// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Server-side job status values. */
export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

/** Live per-variant progress for a batch job, fed by the SSE stream. */
export interface JobProgress {
  jobId: string;
  done: number;
  total: number;
  status: JobStatus;
}

/** One emotion-avatar variant of an actor (a base/outfitless emotion slot). */
export interface EmotionAvatarVariant {
  id: string;
  assetId: string;
  label: string;
  /** The variant's emotion tag (`tags.emotion`); empty when the avatar is untagged. */
  emotion: string;
}

/** A single batch-generation job. */
export interface EmotionAvatarJob {
  id: string;
  actorId: string;
  status: JobStatus;
  baseAvatarId: string;
  emotions: string[];
  progress?: JobProgress;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

/**
 * State plugin for the emotion-avatar batch-generation panel. Bound to a
 * single actor via `setActorId`.
 */
export interface ActorEmotionAvatarsState {
  _eaActorId: string | null;
  jobs: EmotionAvatarJob[];
  jobsLoading: boolean;
  jobsError: string;
  baseAvatarId: string;
  selectedEmotions: string[];
  promptPrefix: string;
  negativePrompt: string;
  /** Explicit base seed for the next batch; null = the server picks one. */
  seed: number | null;
  /** Re-run under the base seed recorded for this actor's last generation. */
  reuseSeed: boolean;
  /** The actor's base (outfitless) emotion variants. */
  variants: EmotionAvatarVariant[];
  /** Every emotion type the backend can generate. */
  emotionTypes: string[];
  busy: boolean;
  message: string;
  error: string;
  pollIntervalMs: number;
  /** Internal handle for the polling timer (private). */
  _pollHandle: ReturnType<typeof setTimeout> | null;
  /** Internal handle for the polling interval (private). */
  _pollInterval: ReturnType<typeof setInterval> | null;
  /** Internal map of open per-job SSE streams (private). */
  _eaStreams: Map<string, EventSource>;
  setActorId(actorId: string,): void;
  listJobs(): Promise<void>;
  /** Refresh the panel's server state: the job list and the emotion variants. */
  refresh(): Promise<void>;
  /** Load the actor's base emotion variants (the per-emotion re-roll source). */
  loadVariants(): Promise<void>;
  /** Re-roll emotion slots; `replace: "slot"` re-points the emotion binding. */
  regenerate(emotions?: string[],): Promise<boolean>;
  /** Toggle a single emotion in the `selectedEmotions` set. */
  toggleEmotion(emotion: string,): void;
  /** Start a new batch job. Returns true on POST success. */
  startGeneration(): Promise<boolean>;
  /** Cancel a running job. */
  cancelJob(jobId: string,): Promise<void>;
  /** Refresh a single job's status (poll on demand). */
  refreshJob(jobId: string,): Promise<void>;
  /** Start background polling for any non-terminal job. */
  startPolling(): void;
  /** Stop the polling loop. */
  stopPolling(): void;
  /** Open (or replace) the SSE progress stream for a job. */
  connectJobStream(jobId: string,): void;
  /** Close the SSE progress stream for a job, if open (private). */
  _closeJobStream(jobId: string,): void;
  /** Open SSE streams for every active job in the list (private). */
  _connectActiveJobStreams(): void;
  /** True when the job has not reached a terminal state. */
  isJobActive(job: EmotionAvatarJob,): boolean;
}
