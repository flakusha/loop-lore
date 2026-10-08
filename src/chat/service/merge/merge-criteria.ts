// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Content-merge taxonomy (FEA-2026-047).
 *
 * The closed `MergeMode` set (persisted verbatim in `branch_merges.mode`),
 * the ordinal semantics that keep modes 2/3/5 stable regardless of picker
 * order, the per-mode prompt instruction blocks, and the shared error shape
 * every `merge/*` module returns.
 */

/** Content-merge strategies. Values are persisted verbatim. */
export const MergeMode = {
  Combined: "combined",
  SecondOverFirst: "second-over-first",
  FirstOverSecond: "first-over-second",
  FreshDiscovery: "fresh-discovery",
  SinglePlusGlean: "single-plus-glean",
} as const;
/** */
export type MergeMode = (typeof MergeMode)[keyof typeof MergeMode];

/** All modes, in the documented 1–5 order (mode CHECK constraint order). */
export const MERGE_MODES: readonly MergeMode[] = [
  MergeMode.Combined,
  MergeMode.SecondOverFirst,
  MergeMode.FirstOverSecond,
  MergeMode.FreshDiscovery,
  MergeMode.SinglePlusGlean,
];

/**
 * Runtime guard for a mode string crossing a trust boundary.
 * @param value
 * @returns {value is MergeMode}
 */
export function isMergeMode(value: unknown,): value is MergeMode {
  return typeof value === "string" && (MERGE_MODES as readonly string[]).includes(value,);
}

/** How a mode produces its fused continuation. */
export type MergeModeKind = "llm" | "overlay";

/**
 * Overlay modes fuse deterministically (LLM only for conflicts); the rest
 * are LLM-authored.
 * @param mode
 * @returns {MergeModeKind}
 */
export function modeKind(mode: MergeMode,): MergeModeKind {
  return mode === MergeMode.SecondOverFirst || mode === MergeMode.FirstOverSecond ? "overlay" : "llm";
}

/** Per-mode instruction block appended to the delimited user content. */
const MODE_INSTRUCTIONS: Record<MergeMode, string> = {
  [MergeMode.Combined]: "Weave both versions into ONE continuation. Keep the strongest beats of each; where they " +
    "contradict, choose the more consequential and stay consistent; total length is about the " +
    "longer version. No meta-commentary about merging.",
  [MergeMode.SecondOverFirst]: "BASE is version A. Apply version B's change onto it; B's intent wins only where it " +
    "modifies what A established; preserve A's structure.",
  [MergeMode.FirstOverSecond]: "BASE is version B. Apply version A's change onto it; A's intent wins only where it " +
    "modifies what B established; preserve B's structure.",
  [MergeMode.FreshDiscovery]:
    "Both prior continuations were REJECTED. Write a NEW continuation that stays aware of the " +
    "situations and setups each version established (the world must remain coherent) but " +
    "explicitly DOES NOT follow either approach; do not reuse their phrasing, beats, or direction.",
  [MergeMode.SinglePlusGlean]:
    "Return version A nearly verbatim. Graft only slight improvements from the other versions " +
    "(wording, small sensory details). No structural changes.",
};

/**
 * Instruction block for a mode (modes 2/3 are re-framed by ordinal).
 * @param mode
 * @returns {string}
 */
export function modeInstruction(mode: MergeMode,): string {
  return MODE_INSTRUCTIONS[mode];
}

/**
 * Ordinal of the branch used as overlay BASE (overlay modes); null for LLM modes.
 * @param mode
 * @returns {number | null}
 */
export function baseOrdinal(mode: MergeMode,): number | null {
  if (mode === MergeMode.SecondOverFirst) { return 0; }
  if (mode === MergeMode.FirstOverSecond) { return 1; }
  return null;
}

/**
 * Ordinal of the branch whose modifications are APPLIED (overlay modes).
 * @param mode
 * @returns {number | null}
 */
export function overlayOrdinal(mode: MergeMode,): number | null {
  if (mode === MergeMode.SecondOverFirst) { return 1; }
  if (mode === MergeMode.FirstOverSecond) { return 0; }
  return null;
}

/** Discriminated preview request: LLM modes yield an editable draft. */
export type MergePreviewRequest =
  | { kind: "llm"; mode: "combined" | "fresh-discovery" | "single-plus-glean"; styleHint?: string }
  | { kind: "overlay"; mode: "second-over-first" | "first-over-second" };

/**
 * Narrow a mode into its preview contract (exhaustive over {@link MergeMode}).
 * @param mode
 * @param styleHint
 * @returns {MergePreviewRequest}
 */
export function previewRequestFor(mode: MergeMode, styleHint?: string,): MergePreviewRequest {
  if (mode === MergeMode.SecondOverFirst || mode === MergeMode.FirstOverSecond) {
    return { kind: "overlay", mode, };
  }

  return { kind: "llm", mode, styleHint, };
}

/** One draft message from the LLM output contract. */
export interface MergeDraftMessage {
  role: "assistant" | "user" | "character";
  content: string;
}

/** Per-hunk conflict resolution chosen by the user at confirm time. */
export interface MergeConflictChoice {
  hunkIndex: number;
  resolution: "base" | "overlay" | "manual";
}

/** Persisted merge status. */
export type MergeStatus = "draft" | "confirmed" | "discarded";

/**
 * Merge-domain error. Superset of `ServiceError` (adds the 409 `conflict`
 * case and the 502-family LLM failures) so route mapping stays total.
 */
export interface MergeError {
  code: "not_found" | "forbidden" | "bad_request" | "conflict" | "llm_unavailable" | "llm_parse";
  message: string;
}
