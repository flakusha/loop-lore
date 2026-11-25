// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Alpine controls for an async video generation job:
 *   GET  /api/v1/generation/video/status/:jobId
 *   POST /api/v1/generation/jobs/:jobId/cancel|defer|retry
 *
 * There is no pre-existing video status polling module in src/frontend; this
 * is the smallest caller that exposes cancel and "delay until later".
 */
import { type GenerationBusyState, generationBusyState, } from "./generation";
import { apiFetch, } from "./htmx";
import { jsonBody, } from "./json";

const BASE = "/api/v1/generation";
/** Default deferral for the "delay until later" button (1 hour). */
export const DEFAULT_DELAY_MS = 60 * 60 * 1000;

/** State + actions bound by `x-data="videoJobControls()"`. */
export interface VideoJobControls extends GenerationBusyState {
  jobId: string;
  status: string;
  error: string;
  busy: boolean;
  scheduledFor: number | null;
  poll(jobId?: string,): Promise<void>;
  cancel(): Promise<void>;
  defer(delayMs?: number,): Promise<void>;
  retry(): Promise<void>;
}

declare global {
  var videoJobControls: () => VideoJobControls;
}

/** Shared method table; the factory gives each Alpine root its own state. */
export const videoJobControlState: VideoJobControls = {
  ...generationBusyState,
  jobId: "",
  status: "",
  error: "",
  busy: false,
  scheduledFor: null,

  async poll(jobId?: string,): Promise<void> {
    const id = jobId ?? this.jobId;
    if (!id) { return; }
    this.jobId = id;
    try {
      const res = await apiFetch(`${BASE}/video/status/${encodeURIComponent(id,)}`,);
      if (!res.ok) {
        this.error = `Video job status unavailable (${res.status})`;
        return;
      }

      const payload = await res.json() as {
        data?: { jobId?: string; status?: string; scheduledFor?: number | null; error?: string };
      };

      this.status = payload.data?.status ?? "";
      this.scheduledFor = payload.data?.scheduledFor ?? null;
      this.error = payload.data?.error ?? "";
    } catch {
      this.error = "Video job status unavailable";
    } finally {
      await this.refreshActive();
    }
  },

  async cancel(): Promise<void> {
    await controlRequest(this, "cancel",);
  },

  async defer(delayMs = DEFAULT_DELAY_MS,): Promise<void> {
    await controlRequest(this, "defer", { scheduledFor: Date.now() + delayMs, },);
  },

  async retry(): Promise<void> {
    await controlRequest(this, "retry",);
  },
};

/**
 * POST one control verb, then refresh the poll state.
 * @param state - Alpine component state
 * @param verb - cancel | defer | retry
 * @param body - optional JSON body
 */
async function controlRequest(
  state: VideoJobControls,
  verb: "cancel" | "defer" | "retry",
  body?: unknown,
): Promise<void> {
  if (!state.jobId || state.busy) { return; }
  state.busy = true;
  state.error = "";
  try {
    const res = await apiFetch(`${BASE}/jobs/${encodeURIComponent(state.jobId,)}/${verb}`, {
      method: "POST",
      ...(body === undefined
        ? {}
        : { headers: { "Content-Type": "application/json", }, body: jsonBody(body,), }),
    },);

    if (!res.ok) {
      state.error = `Video job ${verb} failed (${res.status})`;
    }

    await state.poll();
  } catch {
    state.error = `Video job ${verb} unavailable`;
  } finally {
    state.busy = false;
  }
}

/** Alpine factory — one state object per `x-data` root. */
globalThis.videoJobControls = () => ({ ...videoJobControlState, });
