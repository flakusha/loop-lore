// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { LocationEdgeMode, type LocationEdgeMode as LocationEdgeModeType, } from "../db/enums-story/world";

/** Application-level rejection reason for an edge operation. */
export type LocationEdgeErrorCode =
  | "self"
  | "bad-mode"
  | "not-found"
  | "cross-world"
  | "duplicate"
  | "bad-cost"
  | "not-yet-discovered"
  | "missing-actor"
  | "insufficient"
  | "cooldown";

/** Typed rejection for edge create/read/travel flows. */
export class LocationEdgeError extends Error {
  /**
   * @param code machine-readable reason; routes map it to 400/404
   * @param message human-readable detail
   */
  constructor(
    public readonly code: LocationEdgeErrorCode,
    message: string,
  ) {
    super(message,);
    this.name = "LocationEdgeError";
  }
}

/** Validated free-jump price tag (TASK-party-free-jump-location-graph-edge). */
export interface EdgeCost {
  gold?: number;
  itemId?: string;
  cooldownHours?: number;
  requiresFactionStanding?: string;
}

/** The mode union as an array, for route validation. */
export const EDGE_MODES = Object.values(LocationEdgeMode,) as LocationEdgeModeType[];

/** Fast membership check for mode strings coming off the wire. */
export const EDGE_MODE_SET = new Set<string>(EDGE_MODES,);

/**
 * Render an instant as SQLite `datetime('now')`-style text, the format
 * `updated_at` columns store.
 * @param now instant to render
 * @returns {string} `YYYY-MM-DD HH:MM:SS` in UTC
 */
export function sqlStamp(now: Date,): string {
  return now.toISOString().replace("T", " ",).replace(/\.\d+Z$/, "",);
}

/**
 * Parse and validate a free-jump cost payload. Unknown keys and junk
 * values are rejected so silent no-ops cannot masquerade as pricing.
 * @param raw parsed JSON body fragment
 * @returns {EdgeCost} normalized cost
 * @throws {LocationEdgeError} code "bad-cost" on any invalid entry
 */
export function parseEdgeCost(raw: unknown,): EdgeCost {
  if (raw === undefined || raw === null) { return {}; }
  if (typeof raw !== "object" || Array.isArray(raw,)) {
    throw new LocationEdgeError("bad-cost", "cost must be an object",);
  }

  const out: EdgeCost = {};
  const cost = raw as Record<string, unknown>;
  for (const entry of Object.entries(cost,)) {
    const key = entry[0];
    const value = entry[1];
    if (key === "gold") {
      if (typeof value !== "number" || !Number.isFinite(value,) || value <= 0) {
        throw new LocationEdgeError("bad-cost", "cost.gold must be a positive number",);
      }

      out.gold = value;
    } else if (key === "itemId") {
      if (typeof value !== "string" || value === "") {
        throw new LocationEdgeError("bad-cost", "cost.itemId must be a non-empty string",);
      }

      out.itemId = value;
    } else if (key === "cooldownHours") {
      if (typeof value !== "number" || !Number.isFinite(value,) || value <= 0) {
        throw new LocationEdgeError("bad-cost", "cost.cooldownHours must be a positive number",);
      }

      out.cooldownHours = value;
    } else if (key === "requiresFactionStanding") {
      if (typeof value !== "string" || value === "") {
        throw new LocationEdgeError("bad-cost", "cost.requiresFactionStanding must be a non-empty string",);
      }

      out.requiresFactionStanding = value;
    } else {
      throw new LocationEdgeError("bad-cost", `unknown cost key: ${key}`,);
    }
  }

  return out;
}
