// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Federation panel state, spread into `adminPage()` like `admin-audit.ts`.
 *
 * Reuses the existing mechanisms unchanged: `apiFetch` for transport,
 * `parseOr` against `src/validation/schemas/responses-federation` so a payload
 * that fails schema validation degrades to the empty default instead of
 * throwing inside the tab, and 30s interval polling matching the admin shell's
 * own cadence. No new polling mechanism, no SSE.
 *
 * The panel holds NO peer token. `sharedToken` lives only in `fedPeerDraft`
 * while the operator is typing it into the add form and is sent once on save;
 * it is never read back from a response because no response carries one.
 */

import {
  AdminFederationMatrix,
  type AdminFederationPeer,
  AdminFederationPeerSave,
  AdminFederationUsage,
} from "../../validation/schemas/responses-federation";
import { apiFetch, } from "./htmx";
import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";
import { parseOr, } from "./validation";

const log = rootLog.child({ module: "admin-federation", },);

/** Poll cadence, matching the admin shell's own 30s overview poll. */
export const FEDERATION_POLL_MS = 30_000;

const EMPTY_USAGE = { enabled: false, peers: [], storage: null, };
const EMPTY_MATRIX = { matrix: { preferences: {}, }, };
const EMPTY_PEER_SAVE = {
  peer: null,
  probe: { outcome: "", reason: "", },
};

/** Base for the federation routes. Admin routes mount under /api/v1. */
const FEDERATION_API = "/api/v1/admin/federation";

export const adminFederation = {
  // ── Usage dashboard (read-only) ─────────────────────
  fedUsage: EMPTY_USAGE,
  loadingFederation: false,
  /** True once a call came back 403 — renders an error state, not a blank tab. */
  fedForbidden: false,
  fedError: "",
  _fedPollTimer: null as ReturnType<typeof setInterval> | null,

  // ── Peer list + add form ───────────────────────────
  fedPeers: [] as AdminFederationPeer[],
  fedPeerDraft: {
    origin: "",
    displayName: "",
    instanceKind: "general",
    workloadTrust: false,
    stickyEnabled: false,
    allowedWorkloadClasses: [] as string[],
    /** Write-only. Cleared immediately after a save attempt. */
    sharedToken: "",
  },
  /** Probe verdict from the last save, shown inline. */
  fedProbeOutcome: "",
  fedProbeReason: "",

  // ── Delete typed-confirm ────────────────────────────
  fedDeleteOrigin: "",
  fedDeleteConfirm: "",

  // ── Assignment matrix ──────────────────────────────
  fedMatrix: {} as Record<string, string[]>,
  fedWorkloadClasses: [] as string[],

  // ── Budget editor ──────────────────────────────────
  fedBudgetDraft: {
    origin: "",
    workloadClass: "",
    mode: "advisory",
    maxConcurrency: "",
    maxQueueDepth: "",
    requestsPerMinute: "",
    tokensPerMinute: "",
  },

  /**
   * Typed-confirm gate for peer delete. An empty or mismatched origin can never
   * submit — the origin is the thing being destroyed, so a partial confirm is
   * not a confirmation.
   * @param origin the peer being deleted
   * @returns {boolean}
   */
  fedDeleteConfirmed(origin: string,): boolean {
    return this.fedDeleteOrigin === origin && this.fedDeleteConfirm.trim() === origin;
  },

  /**
   * Load the usage dashboard. Starts the poll on first call so the tab does not
   * keep a timer alive for a view the operator has not opened.
   * @returns {Promise<void>}
   */
  async loadFederation(): Promise<void> {
    this.loadingFederation = true;
    try {
      const res = await apiFetch(`${FEDERATION_API}/usage`, { headers: { Accept: "application/json", }, },);
      if (res.status === 403) {
        this.fedForbidden = true;
        this.fedError = "forbidden";
        return;
      }

      if (!res.ok) {
        this.fedError = `usage_${res.status}`;
        return;
      }

      this.fedForbidden = false;
      this.fedError = "";
      this.fedUsage = parseOr(AdminFederationUsage, await res.json(), EMPTY_USAGE,);
      this.fedPeers = this.fedUsage.peers as AdminFederationPeer[];
    } catch (error) {
      this.fedError = "usage_network";
      log.warn("federation usage load failed", { error: String(error,), },);
    } finally {
      this.loadingFederation = false;
      this._startFedPoll();
    }
  },

  /** Start the 30s poll exactly once. */
  _startFedPoll(): void {
    if (this._fedPollTimer !== null) { return; }
    this._fedPollTimer = setInterval(() => {
      // A poll in flight when the tab closes must not touch detached state; the
      // timer's handle is cleared in destroyFederation() and the callback checks
      // nothing to mutate, because Alpine has already dropped the component.
      this.loadFederation();
    }, FEDERATION_POLL_MS,);
  },

  /** Stop the poll. Called by the shell's destroy(). */
  destroyFederation(): void {
    if (this._fedPollTimer === null) { return; }
    clearInterval(this._fedPollTimer,);
    this._fedPollTimer = null;
  },

  /**
   * Load the assignment matrix.
   * @returns {Promise<void>}
   */
  async loadFederationMatrix(): Promise<void> {
    try {
      const res = await apiFetch(`${FEDERATION_API}/matrix`, { headers: { Accept: "application/json", }, },);
      if (!res.ok) { return; }
      const parsed = parseOr(AdminFederationMatrix, await res.json(), EMPTY_MATRIX,);
      this.fedMatrix = { ...parsed.matrix.preferences, };
    } catch (error) {
      log.warn("federation matrix load failed", { error: String(error,), },);
    }
  },

  /**
   * Persist the whole matrix.
   * @returns {Promise<void>}
   */
  async saveFederationMatrix(): Promise<void> {
    try {
      const res = await apiFetch(`${FEDERATION_API}/matrix`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json", },
        body: jsonBody({ preferences: this.fedMatrix, },),
      },);

      if (!res.ok) {
        this.fedError = `matrix_${res.status}`;
        return;
      }

      const parsed = parseOr(AdminFederationMatrix, await res.json(), EMPTY_MATRIX,);
      this.fedMatrix = { ...parsed.matrix.preferences, };
    } catch (error) {
      this.fedError = "matrix_network";
      log.warn("federation matrix save failed", { error: String(error,), },);
    }
  },

  /**
   * Save a peer, then show the probe verdict inline. The token is sent once and
   * cleared from state immediately, so it does not linger in the component.
   * @returns {Promise<void>}
   */
  async saveFederationPeer(): Promise<void> {
    const draft = this.fedPeerDraft;
    try {
      const res = await apiFetch(`${FEDERATION_API}/peers`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", },
        body: jsonBody({
          origin: draft.origin,
          displayName: draft.displayName || null,
          instanceKind: draft.instanceKind,
          workloadTrust: draft.workloadTrust,
          stickyEnabled: draft.stickyEnabled,
          allowedWorkloadClasses: draft.allowedWorkloadClasses,
          sharedToken: draft.sharedToken || null,
        },),
      },);

      // One-way: the plaintext token leaves the component on save and is never
      // read back, because no response carries one.
      draft.sharedToken = "";

      if (!res.ok) {
        this.fedError = `peer_${res.status}`;
        this.fedProbeOutcome = "";
        return;
      }

      const parsed = parseOr(AdminFederationPeerSave, await res.json(), EMPTY_PEER_SAVE,);
      this.fedProbeOutcome = parsed.probe.outcome;
      this.fedProbeReason = parsed.probe.reason;
      this.fedPeerDraft.origin = "";
      this.fedPeerDraft.displayName = "";
      await this.loadFederation();
    } catch (error) {
      this.fedError = "peer_network";
      log.warn("federation peer save failed", { error: String(error,), },);
    }
  },

  /**
   * Delete a peer. The route refuses unless the confirm matched, and the client
   * re-checks so a mismatched confirm never reaches the wire.
   * @param origin the peer to delete
   * @returns {Promise<void>}
   */
  async deleteFederationPeer(origin: string,): Promise<void> {
    if (!this.fedDeleteConfirmed(origin,)) { return; }
    try {
      const res = await apiFetch(`${FEDERATION_API}/peers/${encodeURIComponent(origin,)}`, { method: "DELETE", },);
      if (!res.ok) {
        this.fedError = `peer_delete_${res.status}`;
        return;
      }

      this.fedDeleteOrigin = "";
      this.fedDeleteConfirm = "";
      await this.loadFederation();
    } catch (error) {
      this.fedError = "peer_delete_network";
      log.warn("federation peer delete failed", { error: String(error,), },);
    }
  },

  /**
   * Persist one budget cell. Blank inputs become null, which the route reads as
   * UNLIMITED; the panel never sends 0 to mean unlimited.
   * @returns {Promise<void>}
   */
  async saveFederationBudget(): Promise<void> {
    const draft = this.fedBudgetDraft;
    // Empty field -> null (unlimited), never 0. Kept as a named helper rather
    // than inlined four times so the null-means-unlimited rule has one home.
    const num = (raw: string,): number | null => (raw.trim() === "" ? null : Number(raw,));

    try {
      const res = await apiFetch(`${FEDERATION_API}/budgets`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json", },
        body: jsonBody({
          origin: draft.origin,
          workloadClass: draft.workloadClass,
          mode: draft.mode,
          maxConcurrency: num(draft.maxConcurrency,),
          maxQueueDepth: num(draft.maxQueueDepth,),
          requestsPerMinute: num(draft.requestsPerMinute,),
          tokensPerMinute: num(draft.tokensPerMinute,),
        },),
      },);

      if (!res.ok) {
        this.fedError = `budget_${res.status}`;
        return;
      }

      await this.loadFederation();
    } catch (error) {
      this.fedError = "budget_network";
      log.warn("federation budget save failed", { error: String(error,), },);
    }
  },
};
