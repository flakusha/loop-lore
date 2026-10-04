// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Re-export the entire server contract so any drift is a compile error in the TUI.
// `HarnessRunDetail` is re-exported too, not redeclared: it used to be a local
// `extends HarnessRunSummary` guess at the detail endpoint, and that guess is
// what let the endpoint return `runMs` while the TUI read `durationMs`. The
// server type is now the only declaration, so the two cannot drift apart.
export type {
  HarnessByModel,
  HarnessByPattern,
  HarnessByTaskType,
  HarnessRunDetail,
  HarnessRunSummary,
  HarnessStats,
  HarnessToolingGap,
  HarnessTotals,
} from "../../harness/read-models";
export type {
  HarnessResult,
  HarnessTaskType,
} from "../../harness/types";
