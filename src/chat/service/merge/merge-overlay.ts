// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Three-way overlay for the overlay merge modes (FEA-2026-047). Hunks
 * classified kept/applied/conflict, with conflict resolution and a
 * changed-line ratio guard for `single-plus-glean`.
 */
import type { ChangeBlock, MergeHunk, } from "./merge-diff";
import { changeBlocks, diffLines, } from "./merge-diff";

/**
 * Emit a `kept` hunk for an unchanged ancestor run (skips empty runs).
 * @param hunks
 * @param lines
 */
function pushUnchanged(hunks: MergeHunk[], lines: string[],): void {
  if (lines.length === 0) { return; }
  hunks.push({ status: "kept", base: lines, overlay: lines, result: [...lines,], },);
}

/**
 * Classify one overlapping change region across both sides.
 * @param ancestorLines
 * @param cluster
 */
function classifyCluster(
  ancestorLines: string[],
  cluster: { side: "base" | "overlay"; block: ChangeBlock }[],
): MergeHunk {
  const baseLines = cluster.filter((e,) => e.side === "base").flatMap((e,) => e.block.lines);
  const overlayLines = cluster.filter((e,) => e.side === "overlay").flatMap((e,) => e.block.lines);
  const baseChanged = cluster.some((e,) => e.side === "base");
  const overlayChanged = cluster.some((e,) => e.side === "overlay");

  if (!overlayChanged) {
    return { status: "kept", base: baseLines, overlay: ancestorLines, result: [...baseLines,], };
  }

  if (!baseChanged) {
    return { status: "applied", base: ancestorLines, overlay: overlayLines, result: [...overlayLines,], };
  }

  if (baseLines.length === overlayLines.length && baseLines.every((l, k,) => l === overlayLines[k])) {
    return { status: "applied", base: baseLines, overlay: overlayLines, result: [...baseLines,], };
  }

  return { status: "conflict", base: baseLines, overlay: overlayLines, result: null, };
}

/**
 * Three-way overlay: the ancestor is the shared base, `base` is the BASE
 * branch's tail and `overlay` the modifications applied onto it.
 * @param ancestor
 * @param base
 * @param overlay
 * @returns {MergeHunk[]}
 */
export function threeWayOverlay(ancestor: string[], base: string[], overlay: string[],): MergeHunk[] {
  const baseBlocks = changeBlocks(diffLines(ancestor, base,),);
  const overlayBlocks = changeBlocks(diffLines(ancestor, overlay,),);
  const events = [
    ...baseBlocks.map((block,) => ({ side: "base" as const, block, })),
    ...overlayBlocks.map((block,) => ({ side: "overlay" as const, block, })),
  ].sort((x, y,) => x.block.start - y.block.start);

  const hunks: MergeHunk[] = [];
  let cursor = 0;
  let i = 0;
  while (i < events.length) {
    const cluster: typeof events = [];
    const regionStart = events[i]!.block.start;
    let regionEnd = events[i]!.block.end;
    while (i < events.length && events[i]!.block.start <= regionEnd) {
      const event = events[i]!;
      cluster.push(event,);
      regionEnd = Math.max(regionEnd, event.block.end,);
      i++;
    }

    pushUnchanged(hunks, ancestor.slice(cursor, regionStart,),);
    hunks.push(classifyCluster(ancestor.slice(regionStart, regionEnd,), cluster,),);
    cursor = regionEnd;
  }

  pushUnchanged(hunks, ancestor.slice(cursor,),);
  return hunks;
}

/**
 * Flatten hunks into output lines. Unresolved conflicts yield null.
 * @param hunks
 * @param resolutions per-conflict choice keyed by hunk index
 * @returns {string[] | null}
 */
export function applyHunks(
  hunks: MergeHunk[],
  resolutions: ReadonlyMap<number, "base" | "overlay"> = new Map(),
): string[] | null {
  const out: string[] = [];
  for (const [index, hunk,] of hunks.entries()) {
    if (hunk.result !== null) {
      out.push(...hunk.result,);
      continue;
    }

    const choice = resolutions.get(index,);
    if (choice === "base") { out.push(...hunk.base,); }
    else if (choice === "overlay") {
      out.push(...hunk.overlay,);
    } else { return null; }
  }

  return out;
}

/**
 * Share of lines changed between two texts (0–1), for the `single-plus-glean`
 * guard. Uses the edit-script distance over the longer side.
 * @param a
 * @param b
 * @returns {number}
 */
export function changedLineRatio(a: string[], b: string[],): number {
  const longest = Math.max(a.length, b.length,);
  if (longest === 0) { return 0; }
  const ops = diffLines(a, b,);
  let changed = 0;
  for (const op of ops) { if (op.kind !== "equal") { changed += op.lines.length; } }
  return Math.min(1, changed / longest,);
}
