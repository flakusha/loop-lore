// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Persistent-failure cluster grouping — pure folding of already-queried
 * `tooling_reports` rows. The instance scope and count threshold live in
 * `listPersistentFailureClusters` (src/harness/reports.ts); this module does
 * no I/O, registers no jobs and writes no files or tickets.
 */
import type { ToolingReportRow, } from "../../harness/reports";

/** One deduped failure cluster, ready for reporting. */
export interface FailureCluster {
  dedupeKey: string;
  tool: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
}

/**
 * Fold thresholded report rows into one cluster per `dedupe_key`. Rows with
 * no key are one-shot reports, not clusters, and are skipped. Repeats of a
 * key accumulate `count` and widen the seen window.
 * @param rows - instance-scoped persistent_failure rows over the threshold
 * @returns clusters, most frequent first, then by key (stable output)
 */
export function groupFailureClusters(
  rows: readonly ToolingReportRow[],
): FailureCluster[] {
  const clusters = new Map<string, FailureCluster>();

  for (const row of rows) {
    const key = row.dedupe_key;
    if (key === null || key === "") { continue; }

    const cluster = clusters.get(key,);
    if (cluster === undefined) {
      clusters.set(key, {
        dedupeKey: key,
        tool: row.tool,
        count: row.count,
        firstSeen: row.ts,
        lastSeen: row.last_seen ?? row.ts,
      },);

      continue;
    }

    cluster.count += row.count;
    if (row.ts < cluster.firstSeen) { cluster.firstSeen = row.ts; }
    const lastSeen = row.last_seen ?? row.ts;
    if (lastSeen > cluster.lastSeen) { cluster.lastSeen = lastSeen; }
  }

  return [...clusters.values(),].sort((a, b,) =>
    b.count - a.count || (a.dedupeKey < b.dedupeKey ? -1 : a.dedupeKey > b.dedupeKey ? 1 : 0)
  );
}
