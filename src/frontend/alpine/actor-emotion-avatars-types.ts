// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Server-side job status values. */
export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

/** A single batch-generation job. */
export interface EmotionAvatarJob {
  id: string;
  actorId: string;
  status: JobStatus;
  baseAvatarId: string;
  emotions: string[];
  progress?: number;
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
  busy: boolean;
  message: string;
  error: string;
  pollIntervalMs: number;
  /** Internal handle for the polling timer (private). */
  _pollHandle: ReturnType<typeof setTimeout> | null;
  /** Internal handle for the polling interval (private). */
  _pollInterval: ReturnType<typeof setInterval> | null;
  setActorId(actorId: string,): void;
  listJobs(): Promise<void>;
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
  /** True when the job has not reached a terminal state. */
  isJobActive(job: EmotionAvatarJob,): boolean;
}
