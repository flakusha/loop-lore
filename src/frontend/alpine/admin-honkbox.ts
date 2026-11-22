// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Read-only admin caller for the honkbox capability/queue status panel.
 *
 *   GET /api/v1/admin/honkbox/status
 *
 * The server owns the probe and fails closed to an explicit `unavailable`
 * state; this module only projects the contracted fields. An error stays in
 * the section's own channel so the rest of the Local Models tab remains usable.
 */
import { jsonParseOr, } from "./json";

/** `GET /api/v1/admin/honkbox/status`. */
export const HONKBOX_STATUS_URL = "/api/v1/admin/honkbox/status";

/** Honkbox status as served by the admin route. */
export interface HonkboxStatus {
  configured: boolean;
  state: "unavailable" | "degraded" | "available";
  availability: boolean;
  reason: string | null;
  gpuSlots: number | null;
  queueWaitSecs: number | null;
  retryAfterSecs: number | null;
  jobsEnabled: boolean;
  eventsEnabled: boolean;
  toolsEnabled: boolean;
  externalTools: { id: string; available: boolean }[];
  cached: boolean;
}

/** Alpine component state for the honkbox panel. */
export interface AdminHonkboxState {
  status: HonkboxStatus;
  loading: boolean;
  error: string;
  /** Alpine lifecycle hook — loads the current status. */
  init(): Promise<void>;
  /** Reload the status from the server. */
  loadStatus(): Promise<void>;
}

/** Fail-closed default: an unprobed honkbox is unavailable, not healthy. */
function unavailableStatus(): HonkboxStatus {
  return {
    configured: false,
    state: "unavailable",
    availability: false,
    reason: "not-loaded",
    gpuSlots: null,
    queueWaitSecs: null,
    retryAfterSecs: null,
    jobsEnabled: false,
    eventsEnabled: false,
    toolsEnabled: false,
    externalTools: [],
    cached: false,
  };
}

/**
 * Keep only contracted fields; anything unknown or malformed reads as absent.
 * @param body - parsed response body
 * @returns the projected status
 */
function normalizeStatus(body: Partial<HonkboxStatus>,): HonkboxStatus {
  const state = body.state;
  const tools = Array.isArray(body.externalTools,) ? body.externalTools : [];
  return {
    configured: body.configured === true,
    state: state === "available" || state === "degraded" || state === "unavailable"
      ? state
      : "unavailable",
    availability: body.availability === true,
    reason: typeof body.reason === "string" ? body.reason : null,
    gpuSlots: typeof body.gpuSlots === "number" ? body.gpuSlots : null,
    queueWaitSecs: typeof body.queueWaitSecs === "number" ? body.queueWaitSecs : null,
    retryAfterSecs: typeof body.retryAfterSecs === "number" ? body.retryAfterSecs : null,
    jobsEnabled: body.jobsEnabled === true,
    eventsEnabled: body.eventsEnabled === true,
    toolsEnabled: body.toolsEnabled === true,
    externalTools: tools.filter((tool,) => typeof tool?.id === "string").map((tool,) => ({
      id: tool.id,
      available: tool.available === true,
    })),
    cached: body.cached === true,
  };
}

/**
 * Build a fresh honkbox panel state.
 * @returns {AdminHonkboxState}
 */
export function createAdminHonkbox(): AdminHonkboxState {
  return {
    status: unavailableStatus(),
    loading: false,
    error: "",

    async init() {
      await this.loadStatus();
    },

    async loadStatus() {
      if (this.loading) { return; }
      this.loading = true;
      this.error = "";
      try {
        const res = await apiFetch(HONKBOX_STATUS_URL, { headers: { Accept: "application/json", }, },);
        if (!res.ok) {
          const body = jsonParseOr<{ message?: string; error?: string }>(await res.text(), {},);
          this.error = body.message ?? body.error ?? "Could not load honkbox status";
          return;
        }

        this.status = normalizeStatus(await res.json() as Partial<HonkboxStatus>,);
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Could not load honkbox status";
      } finally {
        this.loading = false;
      }
    },
  };
}

(globalThis as unknown as Record<string, unknown>).adminHonkbox = createAdminHonkbox;
