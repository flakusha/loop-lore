// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Admin agent-actions audit panel state.
 *
 * Reads the shipped admin-only route in src/routes/admin/agent-actions.ts:
 *   GET /api/v1/admin/agent-actions?token=&action=&limit=
 *
 * Read-only by design: rows are written by the agent API audit sink, so a
 * mutator here could forge the trail. The route accepts the raw bearer token
 * in `?token=` and still returns only its digest prefix.
 */
import { sqliteUtcToIso, } from "../../utils/date";
import { getThrownErrorMessage, } from "../fe-fetch";
import { formatDisplayDate, } from "./chat-utils/time";

/** One audit row from `GET /api/v1/admin/agent-actions`. */
export interface AgentActionRow {
  id: number;
  token_digest: string;
  user_id: string | null;
  action: string;
  worktree_id: string | null;
  commit_hash: string | null;
  result: string;
  duration_ms: number | null;
  metadata: string | null;
  created_at: string;
}

/** The route's default and maximum page sizes. */
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;

/**
 * Encode the panel filters as a query string.
 *
 * Pure so the encoding is pinned by a unit test; the route clamps the limit
 * itself, but clamping here keeps the URL honest.
 * @param filters - the panel's current inputs
 * @returns the encoded query string, without a leading `?`
 */
export function agentActionsQuery(filters: {
  token?: string;
  action?: string;
  limit?: number;
},): string {
  const params = new URLSearchParams();
  const requested = filters.limit ?? DEFAULT_LIMIT;
  const limit = Number.isFinite(requested,)
    ? Math.min(Math.max(Math.trunc(requested,), 1,), MAX_LIMIT,)
    : DEFAULT_LIMIT;

  params.set("limit", String(limit,),);

  const token = filters.token?.trim();
  if (token) { params.set("token", token,); }
  const action = filters.action?.trim();
  if (action) { params.set("action", action,); }
  return params.toString();
}

/**
 * The message shown for a failed load.
 * @param error - the error the request threw
 * @returns a user-facing message; 401/403 are ordinary states on this page
 */
function agentActionsErrorMessage(error: unknown,): string {
  const status = (error as { status?: number } | null)?.status;
  if (status === 403) { return "You do not have access to the agent audit log."; }
  if (status === 401 || (error instanceof Error && error.message === "Unauthorized")) {
    return "Your session is not authorized for the agent audit log.";
  }

  return getThrownErrorMessage(error, "Failed to load agent actions.",);
}

/** Alpine component state for the agent-actions audit panel. */
export interface AdminAgentActionsState {
  rows: AgentActionRow[];
  token: string;
  action: string;
  loading: boolean;
  error: string;
  /** Load with the current inputs; called by the panel's x-init. */
  init(): Promise<void>;
  /** Reload with the current inputs; called by filters and Refresh. */
  load(): Promise<void>;
  /** Localized write time of one row. */
  timeLabel(row: AgentActionRow,): string;
}

/**
 * Build fresh panel state, registered globally for `x-data="adminAgentActions()"`.
 * @returns the panel state
 */
export function createAdminAgentActions(): AdminAgentActionsState {
  return {
    rows: [],
    token: "",
    action: "",
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
        const query = agentActionsQuery({ token: this.token, action: this.action, },);
        const res = await apiFetch(`/api/v1/admin/agent-actions?${query}`, {
          headers: { Accept: "application/json", },
        },);

        const body = await res.json() as { data?: AgentActionRow[] };
        this.rows = Array.isArray(body.data,) ? body.data : [];
      } catch (error) {
        this.error = agentActionsErrorMessage(error,);
        this.rows = [];
      } finally {
        this.loading = false;
      }
    },

    timeLabel(row: AgentActionRow,): string {
      return formatDisplayDate(sqliteUtcToIso(row.created_at,), "datetime",);
    },
  };
}

(globalThis as unknown as Record<string, unknown>).adminAgentActions = createAdminAgentActions;
