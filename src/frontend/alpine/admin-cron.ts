// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Admin cron jobs panel state.
 *
 *   GET  /api/v1/admin/cron/jobs        — scheduled job statuses
 *   POST /api/v1/admin/cron/jobs/:name/run — manual trigger
 *
 * A 503 means the scheduler is not running (not an error in the job list):
 * the panel shows a distinct "scheduler not running" notice instead of the
 * generic error path.
 */
import { t, } from "./i18n";
import { log as rootLog, } from "./logger";

const log = rootLog.child({ module: "admin-cron", },);

/** Status row from GET /api/v1/admin/cron/jobs. */
export interface CronJobStatus {
  name: string;
  schedule: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

export const adminCron = {
  cronJobs: [] as CronJobStatus[],
  loadingCronJobs: false,
  /** Set only for HTTP 503 — the scheduler is not running. */
  cronSchedulerUnavailable: false,
  cronError: "",
  runningCronJob: "",

  /**
   * @returns {Promise<void>}
   */
  async loadCronJobs() {
    this.loadingCronJobs = true;
    this.cronError = "";
    this.cronSchedulerUnavailable = false;
    try {
      const res = await apiFetch("/api/v1/admin/cron/jobs", {
        headers: { Accept: "application/json", },
      },);

      if (res.status === 503) {
        // Distinct handling: not a load failure, the scheduler is not running.
        this.cronSchedulerUnavailable = true;
        this.cronJobs = [];
        return;
      }

      if (!res.ok) {
        this.cronError = t("toasts.failed",);
        return;
      }

      const jobs = await res.json();
      this.cronJobs = Array.isArray(jobs,) ? jobs : [];
    } catch {
      log.warn("Network error loading cron jobs",);
      this.cronError = t("toasts.networkError",);
    } finally {
      this.loadingCronJobs = false;
    }
  },

  /**
   * @param {string} name
   * @returns {Promise<void>}
   */
  async runCronJob(name: string,) {
    if (this.runningCronJob) { return; }
    this.runningCronJob = name;
    try {
      const res = await apiFetch(
        `/api/v1/admin/cron/jobs/${encodeURIComponent(name,)}/run`,
        { method: "POST", },
      );

      if (res.status === 503) {
        this.cronSchedulerUnavailable = true;
        showToast("error", "Scheduler not running",);
        return;
      }

      if (res.ok) {
        showToast("success", `Job "${name}" triggered`,);
        await this.loadCronJobs();
      } else {
        const err = await res.json();
        showToast("error", err.error || err.message || t("toasts.failed",),);
      }
    } catch {
      showToast("error", t("toasts.networkError",),);
    } finally {
      this.runningCronJob = "";
    }
  },
};

(globalThis as unknown as Record<string, unknown>).adminCron = adminCron;
