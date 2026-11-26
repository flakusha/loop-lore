// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Admin watchdog exec-log panel state.
 *
 * Talks to the shipped read route in src/routes/admin/watchdog.ts:
 *   GET /api/v1/admin/watchdog/events?limit=200
 *
 * Read-only by design: the rows are written solely by the supervisor's
 * `onTransition` seam, so a mutator here would forge the log. The route
 * returns `{ state, events }`; the badge and both filters are derived
 * client-side over the returned rows.
 */
import { sqliteUtcToIso, toDate, } from "../../utils/date";
import { getThrownErrorMessage, } from "../fe-fetch";
import { formatDisplayDate, } from "./chat-utils/time";
import { t, } from "./i18n";

/** One exec-log row from `GET /api/v1/admin/watchdog/events`. */
export interface WatchdogEventRow {
  id: number;
  event_kind: string;
  decision_kind: string;
  at_ms: number;
  created_at: string;
  reason: string | null;
  misses: number | null;
  crashes: number | null;
}

/** The supervisor state a transition leaves behind. */
export type WatchdogBadge = "watching" | "degraded" | "restarting" | "stopped" | "unknown";

/** The recency windows the panel filters by. */
export type WatchdogSince = "all" | "15m" | "1h" | "24h";

/** The window each "since" option covers in ms; "all" keeps every row. */
const SINCE_WINDOW_MS: Record<WatchdogSince, number> = {
  all: 0,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "24h": 24 * 60 * 60_000,
};

/**
 * The supervisor state a transition leaves behind.
 *
 * The kinds come from the watchdog state machine (src/server/watchdog/state.ts):
 * a probe either folds without action (`wait` — the supervisor keeps watching)
 * or kills the child once the misses threshold is reached (`kill`); a crash
 * either schedules a restart (`restart`), stops the supervisor at the crash
 * threshold (`stop`), or is ignored because the supervisor was already stopped
 * (`wait`).
 *
 * A probe that folded with `wait` may also be a miss still below the threshold
 * — the log does not record which — so the badge says "watching", not
 * "healthy".
 * @param eventKind - the transition's event kind (`probe` or `crash`)
 * @param decisionKind - the decision the supervisor took
 * @returns the badge for the pair
 */
export function watchdogBadgeFor(eventKind: string, decisionKind: string,): WatchdogBadge {
  if (eventKind === "probe") {
    if (decisionKind === "kill") { return "degraded"; }
    if (decisionKind === "wait") { return "watching"; }
    return "unknown";
  }

  if (eventKind === "crash") {
    if (decisionKind === "restart") { return "restarting"; }
    if (decisionKind === "stop" || decisionKind === "wait") { return "stopped"; }
    return "unknown";
  }

  return "unknown";
}

/**
 * The localized label of a badge.
 * @param badge - the badge to label
 * @returns the translated label
 */
export function watchdogBadgeLabel(badge: WatchdogBadge,): string {
  switch (badge) {
    case "watching": {
      return t("watchdog.badge.watching",);
    }

    case "degraded": {
      return t("watchdog.badge.degraded",);
    }

    case "restarting": {
      return t("watchdog.badge.restarting",);
    }

    case "stopped": {
      return t("watchdog.badge.stopped",);
    }

    default: {
      return t("watchdog.badge.unknown",);
    }
  }
}

/**
 * The row's wall-clock write time in epoch ms.
 *
 * `created_at` is SQLite's `datetime('now')` text (UTC, zone-less), so it is
 * pinned to UTC before it is parsed — a zone-less string would otherwise be
 * read as local time and shift the row by the viewer's offset.
 * @param row - the exec-log row
 * @returns the write time in epoch ms, NaN when the stamp is unparseable
 */
export function watchdogCreatedAtMs(row: WatchdogEventRow,): number {
  const iso = sqliteUtcToIso(row.created_at,);
  return iso === "" ? Number.NaN : toDate(iso,).getTime();
}

/** The filters applied to the loaded rows. */
export interface WatchdogFilter {
  /** The badge to keep; "all" keeps every state. */
  state: WatchdogBadge | "all";
  /** The recency window to keep. */
  since: WatchdogSince;
  /** Wall-clock "now" in epoch ms — passed in so the filter stays deterministic. */
  nowMs: number;
}

/**
 * The rows left after the state badge and the recency window.
 *
 * The recency window is measured against the row's write time (`created_at`),
 * not the transition clock (`at_ms`): "the last 15 minutes" is a question
 * about wall-clock time, and the log keeps both stamps for exactly that
 * reason.
 * @param rows - the loaded exec-log rows, newest first
 * @param filter - the badge/recency filter
 * @returns the rows to show
 */
export function filterWatchdogEvents(rows: WatchdogEventRow[], filter: WatchdogFilter,): WatchdogEventRow[] {
  const cutoff = filter.since === "all"
    ? Number.NEGATIVE_INFINITY
    : filter.nowMs - SINCE_WINDOW_MS[filter.since];

  return rows.filter((row,) => {
    if (filter.state !== "all" && watchdogBadgeFor(row.event_kind, row.decision_kind,) !== filter.state) {
      return false;
    }

    if (filter.since === "all") { return true; }
    const at = watchdogCreatedAtMs(row,);
    return !Number.isNaN(at,) && at >= cutoff;
  },);
}

/**
 * The message the panel shows for a failed load.
 *
 * `apiFetch` never surfaces a non-2xx response — `feFetch` throws it — so the
 * HTTP status arrives on the error. A 403 (no `admin.system` grant) and a 401
 * (no session) are ordinary states for this page, not failures: they get their
 * own message instead of the generic one.
 * @param error - the error the request threw
 * @returns the message to show
 */
function watchdogErrorMessage(error: unknown,): string {
  const status = (error as { status?: number } | null)?.status;
  if (status === 403) { return t("watchdog.forbidden",); }
  if (status === 401) { return t("watchdog.unauthorized",); }
  // `feFetch` throws a bare `Error("Unauthorized")` on a 401 — the status is
  // not attached there, so the message is the only signal left.
  if (error instanceof Error && error.message === "Unauthorized") { return t("watchdog.unauthorized",); }
  return getThrownErrorMessage(error, t("watchdog.loadFailed",),);
}

/** Alpine component state for the watchdog exec-log panel. */
export interface AdminWatchdogState {
  /** The loaded exec-log rows, newest first. */
  rows: WatchdogEventRow[];
  /** The badge filter; "all" keeps every state. */
  stateFilter: WatchdogBadge | "all";
  /** The recency filter. */
  sinceFilter: WatchdogSince;
  /** A load is in flight. */
  loading: boolean;
  /** The failure message, empty while the panel is healthy. */
  error: string;
  /** Load the exec log (the panel's x-init calls this). */
  init(): Promise<void>;
  /** Reload the exec log. */
  load(): Promise<void>;
  /** The rows left after the filters. */
  visibleRows(): WatchdogEventRow[];
  /** The badge of one row. */
  badgeFor(row: WatchdogEventRow,): WatchdogBadge;
  /** The localized badge label of one row. */
  badgeLabel(row: WatchdogEventRow,): string;
  /** The badge color of one row — a theme variable, so the palette stays the theme's. */
  badgeColor(row: WatchdogEventRow,): string;
  /** The localized write time of one row. */
  timeLabel(row: WatchdogEventRow,): string;
}

/**
 * Build a fresh watchdog panel state. Registered globally so the panel partial
 * can use `x-data="adminWatchdog()"`, the same pattern as adminDbBackup().
 * @returns the panel state
 */
export function createAdminWatchdog(): AdminWatchdogState {
  return {
    rows: [],
    stateFilter: "all",
    sinceFilter: "all",
    loading: false,
    error: "",

    async init() {
      await this.load();
    },

    async load() {
      if (this.loading) { return; }
      this.loading = true;
      this.error = "";
      try {
        const res = await apiFetch("/api/v1/admin/watchdog/events?limit=200", {
          headers: { Accept: "application/json", },
        },);

        const body = await res.json() as { events?: WatchdogEventRow[] };
        this.rows = Array.isArray(body.events,) ? body.events : [];
      } catch (error) {
        this.error = watchdogErrorMessage(error,);
        this.rows = [];
      } finally {
        this.loading = false;
      }
    },

    visibleRows(): WatchdogEventRow[] {
      return filterWatchdogEvents(this.rows, {
        state: this.stateFilter,
        since: this.sinceFilter,
        nowMs: Date.now(),
      },);
    },

    badgeFor(row: WatchdogEventRow,): WatchdogBadge {
      return watchdogBadgeFor(row.event_kind, row.decision_kind,);
    },

    badgeLabel(row: WatchdogEventRow,): string {
      return watchdogBadgeLabel(this.badgeFor(row,),);
    },

    badgeColor(row: WatchdogEventRow,): string {
      switch (this.badgeFor(row,)) {
        case "watching": {
          return "var(--color-success, #2e7d32)";
        }

        case "degraded": {
          return "var(--color-warning, #ed6c02)";
        }

        case "restarting": {
          return "var(--color-info, #1976d2)";
        }

        case "stopped": {
          return "var(--color-danger, #d32f2f)";
        }

        default: {
          return "var(--text-secondary)";
        }
      }
    },

    timeLabel(row: WatchdogEventRow,): string {
      return formatDisplayDate(sqliteUtcToIso(row.created_at,), "datetime",);
    },
  };
}

(globalThis as unknown as Record<string, unknown>).adminWatchdog = createAdminWatchdog;
