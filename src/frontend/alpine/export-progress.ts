// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 290

// ── Export progress panel.
// Drives:
//   POST  /api/export/progress (SSE-streamed)
//   GET   /api/export/status/:jobId (polled status snapshot)
//   GET   /api/export/download/:jobId (final download)
// Pairs with `src/components/export/export-progress-panel.html`.
import { apiFetch, } from "./htmx";
import { t, } from "./i18n";
import { safeJsonParse, } from "./json";
import { log as rootLog, } from "./logger";

/** Server-side job status. */
export type JobStatus = "queued" | "processing" | "completed" | "failed";

const log = rootLog.child({ module: "export-progress", },);

/** Progress snapshot returned by `/api/export/status/:jobId`. */
export interface JobStatusSnapshot {
  id: string;
  status: JobStatus;
  progress: number;
  total: number;
  percentage: number;
  currentStep: string;
  createdAt: string;
  completedAt?: string;
  error?: string;
}

/** A single SSE event from the export stream. */
export interface ExportSseEvent {
  type: string;
  jobId?: string;
  progress?: number;
  total?: number;
  percentage?: number;
  currentStep?: string;
  status?: JobStatus;
  completedAt?: string;
  downloadUrl?: string;
  totalItems?: number;
  error?: string;
  message?: string;
}

/**
 * State plugin for the export-progress panel. Tracks a single export job's
 * progress via SSE (preferred) or polling (fallback) and exposes a download
 * link when the job completes.
 */
export interface ExportProgressState {
  jobId: string;
  status: JobStatus;
  progress: number;
  total: number;
  percentage: number;
  currentStep: string;
  busy: boolean;
  message: string;
  error: string;
  completedAt: string;
  downloadUrl: string;
  /** Internal: EventSource handle for SSE. */
  _sse: EventSource | null;
  /** Internal: poll timer fallback. */
  _pollTimer: ReturnType<typeof setInterval> | null;
  /** Kick off the export job (POST /api/export/progress). */
  startExport(): Promise<void>;
  /** Apply a single SSE event to local state. */
  applyEvent(event: ExportSseEvent,): void;
  /** Apply a status snapshot to local state. Returns true when terminal. */
  applySnapshot(snapshot: JobStatusSnapshot,): boolean;
  /** Start a polling fallback when SSE is unavailable. */
  startPolling(): void;
  /** Stop polling + close the SSE connection. */
  stopTracking(): void;
  /** Reset local state to a fresh "no job" state. */
  reset(): void;
  /** True when the job has finished (success or failure). */
  isTerminal(): boolean;
}

const POLL_INTERVAL_MS = 1_500;

const initialState = (): Pick<
  ExportProgressState,
  | "jobId"
  | "status"
  | "progress"
  | "total"
  | "percentage"
  | "currentStep"
  | "busy"
  | "message"
  | "error"
  | "completedAt"
  | "downloadUrl"
> => ({
  jobId: "",
  status: "queued",
  progress: 0,
  total: 0,
  percentage: 0,
  currentStep: "",
  busy: false,
  message: "",
  error: "",
  completedAt: "",
  downloadUrl: "",
});

export const exportProgress: ExportProgressState = {
  ...initialState(),
  _sse: null,
  _pollTimer: null,

  isTerminal() {
    return this.status === "completed" || this.status === "failed";
  },

  applyEvent(event: ExportSseEvent,) {
    if (event.jobId) { this.jobId = event.jobId; }
    if (typeof event.progress === "number") { this.progress = event.progress; }
    if (typeof event.total === "number") { this.total = event.total; }
    if (typeof event.percentage === "number") { this.percentage = event.percentage; }
    if (typeof event.currentStep === "string") { this.currentStep = event.currentStep; }
    // Terminal frames carry the outcome in `type`, not `status`
    // (src/routes/export-sse/start.ts enqueues `type:"completed"` /
    // `type:"failed"` with no `status` field). `job_created` carries
    // `status:"queued"`; `progress` carries neither.
    if (event.type === "completed" || event.type === "failed") {
      this.status = event.type;
    } else if (event.status) {
      this.status = event.status;
    }
    if (event.error) { this.error = event.error; }
    if (event.message) { this.message = event.message; }
    if (event.completedAt) { this.completedAt = event.completedAt; }
    if (this.status === "completed" && this.jobId) {
      this.downloadUrl = `/api/export/download/${this.jobId}`;
      if (!this.completedAt) { this.completedAt = new Date().toISOString(); }
    }
    if (this.isTerminal()) { this.stopTracking(); }
  },

  applySnapshot(snapshot: JobStatusSnapshot,) {
    this.jobId = snapshot.id;
    this.status = snapshot.status;
    this.progress = snapshot.progress;
    this.total = snapshot.total;
    this.percentage = snapshot.percentage;
    this.currentStep = snapshot.currentStep;
    if (snapshot.completedAt) { this.completedAt = snapshot.completedAt; }
    if (snapshot.status === "completed") {
      this.downloadUrl = `/api/export/download/${snapshot.id}`;
    }
    if (snapshot.status === "failed" && snapshot.error) {
      this.error = snapshot.error;
    }
    return this.isTerminal();
  },

  async startExport() {
    if (this.busy) { return; }
    this.reset();
    this.busy = true;
    this.error = "";
    this.message = "";
    try {
      const res = await apiFetch("/api/export/progress", { method: "POST", stream: true, },);
      if (!res.ok || !res.body) {
        this.error = t("status.exportStartFailed",);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      // The POST returns an SSE stream when EventSource is unavailable via
      // POST. We consume it manually here, applying events as they arrive.
      // Once we observe a terminal status we stop.
      for (;;) {
        const { value, done, } = await reader.read();
        if (done) { break; }
        buffer += decoder.decode(value, { stream: true, },);
        let sep = -1;
        while ((sep = buffer.indexOf("\n\n",)) !== -1) {
          const block = buffer.slice(0, sep,);
          buffer = buffer.slice(sep + 2,);
          for (const line of block.split("\n",)) {
            if (!line.startsWith("data:",)) { continue; }
            const payload = line.slice(5,).trim();
            if (!payload) { continue; }
            const result = safeJsonParse<ExportSseEvent>(payload,);
            if (!result.ok) {
              log.error("Failed to parse SSE event", result.error, {},);
              continue;
            }
            const event = result.value;
            this.applyEvent(event,);
            if (this.isTerminal()) {
              try {
                await reader.cancel();
              } catch { /* ignore */ }
              break;
            }
          }
        }
        if (this.isTerminal()) { break; }
      }
      // If the stream ends without a terminal event, fall back to polling.
      if (!this.isTerminal() && this.jobId) {
        this.startPolling();
      }
    } catch (error) {
      log.error("Failed to start export", error instanceof Error ? error : undefined, {},);
      this.error = t("status.exportStartFailed",);
    } finally {
      this.busy = false;
    }
  },

  startPolling() {
    this.stopTracking();
    if (!this.jobId) { return; }
    const tick = async () => {
      if (!this.jobId || this.isTerminal()) {
        this.stopTracking();
        return;
      }
      try {
        const res = await apiFetch(`/api/export/status/${this.jobId}`, {},);
        if (!res.ok) { return; }
        const snapshot = (await res.json()) as JobStatusSnapshot;
        const terminal = this.applySnapshot(snapshot,);
        if (terminal) { this.stopTracking(); }
      } catch (error) {
        log.error("Failed to poll export status", error instanceof Error ? error : undefined, {},);
      }
    };
    void tick();
    this._pollTimer = setInterval(() => {
      void tick();
    }, POLL_INTERVAL_MS,);
  },

  stopTracking() {
    if (this._sse) {
      this._sse.close();
      this._sse = null;
    }
    if (this._pollTimer) {
      clearInterval(this._pollTimer,);
      this._pollTimer = null;
    }
  },

  reset() {
    this.stopTracking();
    const fresh = initialState();
    this.jobId = fresh.jobId;
    this.status = fresh.status;
    this.progress = fresh.progress;
    this.total = fresh.total;
    this.percentage = fresh.percentage;
    this.currentStep = fresh.currentStep;
    this.busy = false;
    this.message = fresh.message;
    this.error = fresh.error;
    this.completedAt = fresh.completedAt;
    this.downloadUrl = fresh.downloadUrl;
  },
};

/** Build the Alpine scope for the export-progress panel. */
export function exportProgressFactory(): ExportProgressState {
  const state = Object.create(exportProgress,) as ExportProgressState;
  Object.assign(state, initialState(),);
  state._sse = null;
  state._pollTimer = null;
  return state;
}

(globalThis as Record<string, unknown>).exportProgressFactory = exportProgressFactory;
