// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Sessions Security Panel — Alpine component for the multi-session UI.
 *
 * Lists the signed-in user's active sessions (device, IP, activity, expiry),
 * marks the current one, and wires revoke (DELETE /api/v1/sessions/:id) and
 * switch (POST /api/v1/sessions/:id/switch). Mirrors keyManagement()'s
 * state/actions shape; rendered as a settings tab next to the keys tab.
 */

import { formatDisplayDate, } from "./chat-utils/time";
import { apiFetch, } from "./htmx";
import { t, } from "./i18n";
import { log as rootLog, } from "./logger";

const log = rootLog.child({ module: "settings-sessions", },);

/** Wire shape of one session row — `sanitizeSession` on the backend. */
export interface SessionInfo {
  id: string;
  userId: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastActivity: string;
  expiresAt: string;
  isCurrent: boolean;
}

/** The unified frontend request helper signature. */
type ApiFetch = typeof apiFetch;

/**
 * Resolve the request helper at call time: htmx.ts publishes the same
 * function on globalThis for bare-global callers, and tests stub either
 * surface — prefer the global so both interception styles work.
 */
function requestFn(): ApiFetch {
  const g = globalThis as { apiFetch?: ApiFetch };
  return g.apiFetch ?? apiFetch;
}

/**
 * Extract the server's error message from a non-2xx response body
 * (`{ message }`), or null when the body is not parsable.
 * @param res failed response
 */
async function errorMessage(res: Response,): Promise<string | null> {
  try {
    const body = (await res.json()) as { message?: unknown };
    return typeof body.message === "string" ? body.message : null;
  } catch {
    return null;
  }
}

/** Public surface of the sessions panel component (Alpine state + actions). */
export interface SessionsPanelState {
  sessions: SessionInfo[];
  loading: boolean;
  error: string | null;
  currentId: string | null;
  init: () => Promise<void>;
  load: () => Promise<void>;
  fetchSessions: () => Promise<SessionInfo[] | null>;
  revoke: (id: string,) => Promise<void>;
  switchTo: (id: string,) => Promise<void>;
  formatDate: (dateStr: string | null,) => string;
  deviceLabel: (userAgent: string | null,) => string;
}

/**
 * Alpine component factory. Each call returns a fresh state object — tests
 * build one per test so mutations never leak between tests.
 */
export function sessionsPanel(): SessionsPanelState {
  return {
    sessions: [] as SessionInfo[],
    loading: false,
    error: null as string | null,
    currentId: null as string | null,

    /**
     * @returns {Promise<void>}
     */
    async init() {
      await this.load();
    },

    /**
     * Fetch the list and refresh the current badge. Errors (401 unauth,
     * network) surface as an error state — no retry loop.
     * @returns {Promise<void>}
     */
    async load() {
      const rows = await this.fetchSessions();
      if (rows === null) {
        this.error = t("sessions.loadFailed",) || "Failed to load sessions.";
        return;
      }

      this.sessions = rows;
      this.currentId = rows.find((s,) => s.isCurrent)?.id ?? null;
    },

    /**
     * GET /api/v1/sessions → rows, or null on any failure (auth, non-2xx,
     * network). Never throws — failures are the caller's error state.
     * @returns {Promise<SessionInfo[] | null>}
     */
    async fetchSessions(): Promise<SessionInfo[] | null> {
      try {
        const res = await requestFn()("/api/v1/sessions", {
          headers: { Accept: "application/json", },
        },);

        if (!res.ok) {
          log.warn("session list rejected", { status: res.status, },);
          return null;
        }

        const body = (await res.json()) as { data?: SessionInfo[] };
        return body.data ?? [];
      } catch (error) {
        log.warn("session list fetch failed", { error: String(error,), },);
        return null;
      }
    },

    /**
     * Revoke (force-logout) one non-current session. The current session is
     * guarded client-side (the API rejects it — logout is the flow for that).
     * @param {string} id
     * @returns {Promise<void>}
     */
    async revoke(id: string,) {
      if (id === this.currentId) { return; }

      this.loading = true;
      this.error = null;
      try {
        const res = await requestFn()(`/api/v1/sessions/${id}`, {
          method: "DELETE",
        },);

        if (!res.ok) {
          const serverMessage = await errorMessage(res,);
          this.error = serverMessage ?? (t("sessions.revokeFailed",) || "Failed to revoke the session.");
          return;
        }

        this.sessions = this.sessions.filter((s,) => s.id !== id);
      } catch (error) {
        log.warn("session revoke failed", { id, error: String(error,), },);
        this.error = t("sessions.revokeFailed",) || "Failed to revoke the session.";
      } finally {
        this.loading = false;
      }
    },

    /**
     * Switch the active session: the server rotates the session cookie, so a
     * re-list flips the current badge. A 410 means the target expired (and
     * was deleted server-side) — surface it and refresh the list without
     * clearing the surfaced message.
     * @param {string} id
     * @returns {Promise<void>}
     */
    async switchTo(id: string,) {
      if (id === this.currentId) { return; }

      this.loading = true;
      this.error = null;
      try {
        const res = await requestFn()(`/api/v1/sessions/${id}/switch`, {
          method: "POST",
        },);

        if (res.status === 410) {
          this.error = (await errorMessage(res,)) ??
            (t("sessions.expired",) || "That session has expired — list refreshed.");

          const rows = await this.fetchSessions();
          if (rows !== null) {
            this.sessions = rows;
            this.currentId = rows.find((s,) => s.isCurrent)?.id ?? this.currentId;
          }

          return;
        }

        if (!res.ok) {
          const serverMessage = await errorMessage(res,);
          this.error = serverMessage ?? (t("sessions.switchFailed",) || "Failed to switch session.");
          return;
        }

        await this.load();
      } catch (error) {
        log.warn("session switch failed", { id, error: String(error,), },);
        this.error = t("sessions.switchFailed",) || "Failed to switch session.";
      } finally {
        this.loading = false;
      }
    },

    /**
     * @param {string | null} dateStr
     * @returns {string}
     */
    formatDate(dateStr: string | null,): string {
      return formatDisplayDate(dateStr,);
    },

    /**
     * Compact device label: the UA string truncated to a readable width.
     * @param {string | null} userAgent
     * @returns {string}
     */
    deviceLabel(userAgent: string | null,): string {
      if (!userAgent) { return t("sessions.unknownDevice",) || "Unknown device"; }
      return userAgent.length > 48 ? `${userAgent.slice(0, 47,)}…` : userAgent;
    },
  };
}

// Bare-global registration for x-data="sessionsPanel()" (same pattern as
// keyManagement — htmx.ts publishes the function for Alpine templates).
const globalScope = globalThis as unknown as Record<string, unknown>;
globalScope.sessionsPanel = sessionsPanel;
