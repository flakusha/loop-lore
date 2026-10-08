// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Deterministic line diff + three-way overlay for the overlay merge modes
 * (FEA-2026-047). No new dependency: a bounded LCS over line arrays, change
 * blocks keyed to the ancestor, and hunks classified kept/applied/conflict.
 */

/** A diff op over line arrays; `insert` lines live only in the right side. */
export interface DiffOp {
  kind: "equal" | "insert" | "delete";
  lines: string[];
}

/**
 * LCS cell budget. Beyond it the middle region degrades to one
 * delete+insert pair — the result is still a valid edit script, just coarser.
 * Two message tails are small; this only guards a pathological paste.
 */
const MAX_LCS_CELLS = 250_000;

/**
 * Longest common prefix length of two line arrays.
 * @param a
 * @param b
 */
function commonPrefix(a: string[], b: string[],): number {
  const limit = Math.min(a.length, b.length,);
  let n = 0;
  while (n < limit && a[n] === b[n]) { n++; }
  return n;
}

/**
 * Longest common suffix length, not overlapping a known prefix.
 * @param a
 * @param b
 * @param prefix
 */
function commonSuffix(a: string[], b: string[], prefix: number,): number {
  const limit = Math.min(a.length, b.length,) - prefix;
  let n = 0;
  while (n < limit && a[a.length - 1 - n] === b[b.length - 1 - n]) { n++; }
  return n;
}

/**
 * Classic LCS edit script over two bounded line arrays.
 * @param a
 * @param b
 */
function lcsOps(a: string[], b: string[],): DiffOp[] {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table: number[] = new Array(rows * cols,).fill(0,);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * cols + j] = a[i] === b[j]
        ? table[(i + 1) * cols + j + 1]! + 1
        : Math.max(table[(i + 1) * cols + j]!, table[i * cols + j + 1]!,);
    }
  }

  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      pushOp(ops, "equal", a[i]!,);
      i++;
      j++;
    } else if (table[(i + 1) * cols + j]! >= table[i * cols + j + 1]!) {
      pushOp(ops, "delete", a[i]!,);
      i++;
    } else {
      pushOp(ops, "insert", b[j]!,);
      j++;
    }
  }

  while (i < a.length) {
    pushOp(ops, "delete", a[i]!,);
    i++;
  }

  while (j < b.length) {
    pushOp(ops, "insert", b[j]!,);
    j++;
  }

  return ops;
}

/**
 * Append a line to the trailing op when its kind matches, else start one.
 * @param ops
 * @param kind
 * @param line
 */
function pushOp(ops: DiffOp[], kind: DiffOp["kind"], line: string,): void {
  const last = ops[ops.length - 1];
  if (last && last.kind === kind) { last.lines.push(line,); }
  else { ops.push({ kind, lines: [line,], },); }
}

/**
 * Line diff between two texts (edit script: equal/insert/delete runs).
 * @param a
 * @param b
 * @returns {DiffOp[]}
 */
export function diffLines(a: string[], b: string[],): DiffOp[] {
  const prefix = commonPrefix(a, b,);
  const suffix = commonSuffix(a, b, prefix,);
  const midA = a.slice(prefix, a.length - suffix,);
  const midB = b.slice(prefix, b.length - suffix,);

  const ops: DiffOp[] = [];
  if (prefix > 0) { ops.push({ kind: "equal", lines: a.slice(0, prefix,), },); }
  if (midA.length * midB.length <= MAX_LCS_CELLS) {
    ops.push(...lcsOps(midA, midB,),);
  } else {
    if (midA.length > 0) { ops.push({ kind: "delete", lines: midA, },); }
    if (midB.length > 0) { ops.push({ kind: "insert", lines: midB, },); }
  }

  if (suffix > 0) { ops.push({ kind: "equal", lines: a.slice(a.length - suffix,), },); }
  return ops;
}

/** A contiguous ancestor range replaced by `lines` on one side. */
export interface ChangeBlock {
  start: number;
  end: number;
  lines: string[];
}

/**
 * Collapse an edit script into change blocks over the LEFT side's indices.
 * A delete opens a replacement region; an insert at that same boundary
 * fills it. A pure insert (no delete) is its own zero-width block.
 * @param ops
 * @returns {ChangeBlock[]}
 */
export function changeBlocks(ops: DiffOp[],): ChangeBlock[] {
  const blocks: ChangeBlock[] = [];
  let index = 0;
  for (const op of ops) {
    if (op.kind === "equal") {
      index += op.lines.length;
      continue;
    }

    const last = blocks[blocks.length - 1];
    if (op.kind === "delete") {
      if (last && last.end === index && last.lines.length > 0) {
        // Replacement region already open: extend its left span.
        last.end = index + op.lines.length;
      } else {
        blocks.push({ start: index, end: index + op.lines.length, lines: [], },);
      }

      index += op.lines.length;
    } else if (last && last.end === index && last.start < last.end) {
      // Insert at an open replacement boundary: same region.
      last.lines.push(...op.lines,);
    } else {
      blocks.push({ start: index, end: index, lines: [...op.lines,], },);
    }
  }

  return blocks;
}

export interface MergeHunk {
  status: "kept" | "applied" | "conflict";
  base: string[];
  overlay: string[];
  result: string[] | null;
}
// Three-way overlay lives in merge-overlay.ts
