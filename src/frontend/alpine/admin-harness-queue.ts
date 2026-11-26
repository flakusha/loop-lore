// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Admin harness turn-queue panel state.
 *
 * Talks to the shipped admin-gated routes in src/routes/harness/queue.ts:
 *   GET  /api/v1/harness/queue — list turns
 *   POST /api/v1/harness/queue — enqueue one turn
 *   POST /api/v1/harness/queue/turns/:id/cancel — cancel a QUEUED turn
 *
 * Only `queued` turns may be cancelled: a running turn has a live harness
 * process behind it and the backend refuses (no interrupt seam), so the panel
 * never sends that request. 401/403 are ordinary states on this admin page and
 * render as messages rather than crashing the panel.
 */
import { getThrownErrorMessage, } from "../fe-fetch";
import { t, } from "./i18n";
import { jsonBody, } from "./json";

/** One turn row from `GET /api/v1/harness/queue`. */
export interface HarnessQueueTurn {
  id: string;
  batchId: string;
  profile: string;
  prompt: string;
  chatId: string;
  actorId: string;
  createdAt: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
}

/**
 * Whether the panel may offer cancel for a row.
 *
 * The guard mirrors the backend's queued-only rule; the route remains the
 * authority (a turn that started between load and click still answers 409).
 * @param row - the listed turn
 * @returns true only for a queued turn
 */
export function canCancelHarnessQueueTurn(row: HarnessQueueTurn,): boolean {
  return row.status === "queued";
}

/**
 * The message shown for a failed queue request.
 *
 * `apiFetch` throws on every non-2xx; a 403 (no admin grant) and a 401 (no
 * session) are expected states here. `feFetch` throws a bare
 * `Error("Unauthorized")` on a 401, so the message is the only signal there.
 * @param error - the error the request threw
 * @param fallbackKey - i18n key used when the failure carried no reason
 * @returns the message to show
 */
export function harnessQueueErrorMessage(error: unknown, fallbackKey: string,): string {
  const status = (error as { status?: number } | null)?.status;
  if (status === 403) { return t("harnessQueue.forbidden",); }
  if (status === 401 || (error instanceof Error && error.message === "Unauthorized")) {
    return t("harnessQueue.unauthorized",);
  }

  return getThrownErrorMessage(error, t(fallbackKey,),);
}

/** Alpine component state for the harness queue panel. */
export interface AdminHarnessQueueState {
  rows: HarnessQueueTurn[];
  loading: boolean;
  submitting: boolean;
  cancellingId: string | null;
  error: string;
  message: string;
  profile: string;
  prompt: string;
  chatId: string;
  actorId: string;
  /** Load the queue (the panel's x-init calls this). */
  init(): Promise<void>;
  /** Reload the queue. */
  load(): Promise<void>;
  /** Enqueue the form's single turn. */
  enqueue(): Promise<void>;
  /** Cancel one queued turn. */
  cancel(id: string,): Promise<void>;
  /** Whether the cancel control is offered for a row. */
  canCancel(row: HarnessQueueTurn,): boolean;
}

/**
 * Build a fresh queue panel state. Registered globally so the panel partial
 * can use `x-data="adminHarnessQueue()"`, the same pattern as adminDbBackup().
 * @returns the panel state
 */
export function createAdminHarnessQueue(): AdminHarnessQueueState {
  return {
    rows: [],
    loading: false,
    submitting: false,
    cancellingId: null,
    error: "",
    message: "",
    profile: "",
    prompt: "",
    chatId: "",
    actorId: "",

    async init() {
      await this.load();
    },

    async load() {
      if (this.loading) { return; }
      this.loading = true;
      this.error = "";
      try {
        const res = await apiFetch("/api/v1/harness/queue?limit=200", {
          headers: { Accept: "application/json", },
        },);

        const body = await res.json() as { items?: HarnessQueueTurn[] };
        this.rows = Array.isArray(body.items,) ? body.items : [];
      } catch (error) {
        this.error = harnessQueueErrorMessage(error, "harnessQueue.loadFailed",);
        this.rows = [];
      } finally {
        this.loading = false;
      }
    },

    async enqueue() {
      if (this.submitting) { return; }
      const profile = this.profile.trim();
      const prompt = this.prompt.trim();
      const chatId = this.chatId.trim();
      const actorId = this.actorId.trim();
      if (!profile || !prompt || !chatId || !actorId) {
        this.error = t("harnessQueue.formRequired",);
        return;
      }

      this.submitting = true;
      this.error = "";
      this.message = "";
      try {
        await apiFetch("/api/v1/harness/queue", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json", },
          body: jsonBody({
            turns: [{ profile, prompt, chatId, actorId, },],
          },),
        },);

        this.message = t("harnessQueue.enqueued",);
        this.prompt = "";
        await this.load();
      } catch (error) {
        this.error = harnessQueueErrorMessage(error, "harnessQueue.enqueueFailed",);
      } finally {
        this.submitting = false;
      }
    },

    async cancel(id: string,) {
      const row = this.rows.find((candidate,) => candidate.id === id);
      if (!row || !canCancelHarnessQueueTurn(row,) || this.cancellingId !== null) { return; }

      this.cancellingId = id;
      this.error = "";
      this.message = "";
      try {
        await apiFetch(`/api/v1/harness/queue/turns/${encodeURIComponent(id,)}/cancel`, {
          method: "POST",
          headers: { Accept: "application/json", },
        },);

        this.message = t("harnessQueue.cancelled",);
        await this.load();
      } catch (error) {
        this.error = harnessQueueErrorMessage(error, "harnessQueue.cancelFailed",);
      } finally {
        this.cancellingId = null;
      }
    },

    canCancel(row: HarnessQueueTurn,) {
      return canCancelHarnessQueueTurn(row,);
    },
  };
}

(globalThis as unknown as Record<string, unknown>).adminHarnessQueue = createAdminHarnessQueue;
