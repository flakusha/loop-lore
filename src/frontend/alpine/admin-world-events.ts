// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { safeJsonParse, safeJsonStringify, } from "../../utils/safe-json";
import { AdminPaginatedEnvelope, AdminWorldEventRow, } from "../../validation/schemas/responses";
import { log as rootLog, } from "./logger";
import { parseOr, } from "./validation";

const log = rootLog.child({ module: "admin-world-events", },);

type WorldEventEntry = AdminWorldEventRow;

const EMPTY_WORLD_EVENTS = { data: [], total: 0, page: 1, pageSize: 50, };

/** Event types the log can hold today. The server treats the column as an open
 *  vocabulary, so this list is a display convenience, not a filter contract —
 *  an unknown type from a later migration still renders in the unfiltered list. */
const EVENT_TYPES = ["location:discovered", "trade:route",];

/** Admin component for `GET /api/v1/admin/world-events` — the world tick's
 *  simulation log (`location:discovered`, `trade:route`).
 *
 *  `worldId` is required and has no default: the log is world-scoped, so there
 *  is no sensible "first world" to show an operator who has not picked one.
 *  The empty state says so rather than firing a request that would 400. */
export const adminWorldEvents = {
  worldEvents: [] as WorldEventEntry[],
  worldEventsPage: 1,
  worldEventsTotal: 0,
  worldEventsWorldId: "",
  worldEventsType: "",
  loadingWorldEvents: false,
  eventTypeOptions: EVENT_TYPES,

  /**
   * @returns {Promise<void>}
   */
  async loadWorldEvents() {
    if (!this.worldEventsWorldId.trim()) {
      this.worldEvents = [];
      this.worldEventsTotal = 0;
      return;
    }
    this.loadingWorldEvents = true;
    try {
      let url = `/api/v1/admin/world-events?world_id=${encodeURIComponent(this.worldEventsWorldId.trim(),)}` +
        `&page=${this.worldEventsPage}&pageSize=${(this as any).pageSize}`;
      if (this.worldEventsType) { url += `&event_type=${encodeURIComponent(this.worldEventsType,)}`; }
      const res = await apiFetch(url, { headers: { Accept: "application/json", }, },);
      if (res.ok) {
        const data = parseOr(
          AdminPaginatedEnvelope(AdminWorldEventRow,),
          await res.json(),
          EMPTY_WORLD_EVENTS,
        );
        this.worldEvents = data.data;
        this.worldEventsTotal = data.total;
      }
    } catch {
      log.warn("Network error loading world events",);
    } finally {
      this.loadingWorldEvents = false;
    }
  },
  // NOT a `get` — the admin component root does `...adminWorldEvents`, and a
  // spread copies a getter's CURRENT VALUE into a plain property. A getter would
  // freeze to `Math.ceil(0/pageSize) || 1` = 1 at spread time and the pager would
  // never advance. Recomputing inside the template keeps it live. The same trap
  // already bites `auditPages` / `worldPages` in the sibling tabs — see the
  // component root in admin.ts.
  worldEventPages(): number {
    return Math.ceil(this.worldEventsTotal / (this as any).pageSize,) || 1;
  },
  /**
   * @param {number} p
   * @returns {Promise<void>}
   */
  async goWorldEventPage(p: number,) {
    this.worldEventsPage = p;
    await this.loadWorldEvents();
  },
  /**
   * @returns {void}
   */
  searchWorldEvents() {
    this.worldEventsPage = 1;
    this.loadWorldEvents();
  },
  /**
   * @returns {void}
   */
  clearWorldEventFilters() {
    this.worldEventsType = "";
    this.worldEventsPage = 1;
    this.loadWorldEvents();
  },
  /**
   * The stored payload is a JSON string owned by whichever simulation wrote it,
   * so it is pretty-printed for reading and never re-serialised. A payload that
   * will not parse falls back to the raw text rather than blanking the cell.
   * @param {string} raw
   * @returns {string}
   */
  formatWorldEventPayload(raw: string,): string {
    const parsed = safeJsonParse<unknown>(raw,);
    if (!parsed.ok) { return raw; }
    const pretty = safeJsonStringify(parsed.value, 2,);
    return pretty.ok ? pretty.value : raw;
  },
};
