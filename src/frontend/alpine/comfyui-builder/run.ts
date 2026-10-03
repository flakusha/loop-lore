// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Palette + run half of the Builder tab: forward-load the ComfyUI node
 * palette, start a chain run, poll its job to a terminal state.
 */
import { jsonBody, } from "../json";
import { BUILDER_PATH, log, } from "./shared";
import type { ComfyuiBuilder, } from "./types";

const POLL_INTERVAL_MS = 1_000;
const MAX_POLLS = 300;

/** Job statuses that are not terminal yet. */
const LIVE_STATUSES = new Set(["starting", "pending", "running",],);

interface RunJobBody {
  status?: string;
  error?: string | null;
  completedSteps?: number;
  totalSteps?: number;
}

export const builderRunState: Partial<ComfyuiBuilder> & ThisType<ComfyuiBuilder> = {
  palette: {},
  loadingPalette: false,
  paletteError: "",
  runState: { jobId: "", status: "", error: "", completedSteps: 0, totalSteps: 0, },

  /** @returns {Promise<void>} */
  async loadPalette() {
    this.loadingPalette = true;
    this.paletteError = "";
    try {
      const res = await apiFetch(`${BUILDER_PATH}/palette`, {
        headers: { Accept: "application/json", },
      },);
      if (res.ok) {
        const data = await res.json() as {
          data?: Record<string, { display_name: string; category: string }>;
        };
        this.palette = data.data ?? {};
      } else {
        this.paletteError = "Palette load failed";
      }
    } catch {
      this.paletteError = "Network error loading palette";
    } finally {
      this.loadingPalette = false;
    }
  },

  /** @param {string} chainId @returns {Promise<void>} */
  async startRun(chainId: string,) {
    this.runState = { jobId: "", status: "starting", error: "", completedSteps: 0, totalSteps: 0, };
    try {
      const res = await apiFetch(`${BUILDER_PATH}/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ chainId, },),
      },);
      if (!res.ok) {
        const data = await res.json().catch(() => null) as { error?: string; message?: string } | null;
        this.runState.status = "failed";
        this.runState.error = data?.error ?? data?.message ?? "Failed to start run";
        return;
      }
      const data = await res.json() as { jobId?: string };
      this.runState.jobId = data.jobId ?? "";
      await this.pollRun();
    } catch {
      this.runState.status = "failed";
      this.runState.error = "Network error starting run";
    }
  },

  /** @returns {Promise<void>} */
  async pollRun() {
    // Capture the job this loop owns. `startRun` replaces `runState` wholesale,
    // so a superseded loop must never poll or stamp status onto the newer run.
    const jobId = this.runState.jobId;
    let polls = 0;
    while (polls < MAX_POLLS && LIVE_STATUSES.has(this.runState.status,)) {
      if (this.runState.jobId !== jobId) { return; }
      if (polls > 0) {
        await new Promise((resolve,) => setTimeout(resolve, POLL_INTERVAL_MS,));
      }
      polls += 1;
      try {
        const res = await apiFetch(`${BUILDER_PATH}/runs/${jobId}`, {
          headers: { Accept: "application/json", },
        },);
        const data = res.ok
          ? await res.json() as { job?: RunJobBody }
          : null;
        if (this.runState.jobId !== jobId) { return; }
        const job = data?.job;
        if (!job?.status) {
          this.runState.status = "failed";
          this.runState.error = "Run status unavailable";
          return;
        }
        this.runState.status = job.status;
        this.runState.error = job.error ?? "";
        this.runState.completedSteps = job.completedSteps ?? 0;
        this.runState.totalSteps = job.totalSteps ?? 0;
      } catch {
        if (this.runState.jobId !== jobId) { return; }
        log.warn("Network error polling chain run",);
        this.runState.status = "failed";
        this.runState.error = "Network error polling run";
        return;
      }
    }
    if (this.runState.jobId === jobId && LIVE_STATUSES.has(this.runState.status,)) {
      this.runState.status = "failed";
      this.runState.error = "Run polling timed out";
    }
  },
};
