// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Bridge from the isolated decoy listener to the local classification store.
 * The decoy module itself never imports a DB; the host supplies this sink.
 * Labels are logs-only — no block, no enforcement, no caller-controlled id.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import {
  classifyDecoyHit,
  type IndicatorRow,
  recordIndicator,
} from "./classification";
import type { DecoyHit, } from "./decoy-listener";

/** Options for {@link createDecoyHitSink}. */
export interface HitSinkOptions {
  /** Kill switch. Set false to keep serving bait but record no labels. */
  readonly enabled?: boolean;
  /** Called after a row is committed; used as an audit hook in tests. */
  readonly onClassified?: (row: IndicatorRow,) => void;
  /** Label lifetime override. */
  readonly ttlMs?: number;
}

/**
 * Build a decoy hit sink. The returned function never rejects: a store
 * failure is logged and dropped so it cannot break the faked surface.
 * @param database - instance-scoped handle supplied by the host process
 * @param options - kill switch, TTL, and audit hook
 * @returns an async sink suitable for the decoy listener's onHit callback
 */
export function createDecoyHitSink(
  database: Kysely<DB>,
  options: HitSinkOptions = {},
): (hit: DecoyHit,) => Promise<void> {
  const enabled = options.enabled ?? true;

  return async (hit: DecoyHit,): Promise<void> => {
    if (!enabled) { return; }

    try {
      const classification = classifyDecoyHit(hit,);
      if (!classification) { return; }

      const row = await recordIndicator(database, classification, { ttlMs: options.ttlMs, },);
      try {
        getLogger().info("honeypot indicator recorded", {
          indicator: row.indicator,
          label: row.label,
          module: "honeypot",
          source: row.source,
        },);
      } catch {
        // Logger is uninitialised in unit tests — the row is already committed.
      }

      options.onClassified?.(row,);
    } catch (error: unknown) {
      try {
        getLogger().warn("honeypot indicator write failed", {
          err: error,
          module: "honeypot",
        },);
      } catch {
        // Logger uninitialised; the faked surface still serves.
      }
    }
  };
}
