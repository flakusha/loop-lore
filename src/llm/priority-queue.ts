// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/llm/priority-queue.ts — generic priority queue (min-heap by key).
//
// Minimal binary min-heap; stable ordering by insertion counter so equal
// priorities are FIFO. Used by the resource manager to schedule LLM
// requests when slots are contended.
//
// ponytail: in-process only, no persistence. Add DB-backed queue when
// restart-survival matters.

/** Comparator returning < 0 when `a` has higher priority (lower key) than `b`. */
export type Comparator<T,> = (a: T, b: T,) => number;

/** */
export interface PriorityQueueOptions<T,> {
  /** Comparator — defaults to numeric-key ascending (lower key = higher priority). */
  compare?: Comparator<T>;
  /** Optional hard cap; `push` throws when the queue is full and `cap` is set. */
  cap?: number;
}

/**
 * Generic priority queue. `push`/`pop`/`peek`/`size`/`clear`.
 *
 * Ties broken by insertion order (FIFO), so equal-priority items are dequeued
 * in the order they were inserted.
 * @throws if `cap` is set and exceeded.
 */
export class PriorityQueue<T,> {
  private readonly heap: T[] = [];
  private readonly compare: Comparator<T>;
  private readonly cap?: number;
  private seq = 0;
  private readonly entrySeq: number[] = [];

  constructor(opts: PriorityQueueOptions<T> = {},) {
    this.compare = opts.compare ?? ((a, b,) => (a as { key: number }).key - (b as { key: number }).key);
    this.cap = opts.cap;
  }

  /** Insert. Throws `RangeError` when `cap` is set and the queue is full. */
  push(item: T,): void {
    if (this.cap !== undefined && this.heap.length >= this.cap) {
      throw new RangeError(`PriorityQueue: cap ${this.cap} reached`,);
    }
    const seq = this.seq++;
    this.heap.push(item,);
    this.entrySeq.push(seq,);
    this.siftUp(this.heap.length - 1,);
  }

  /** Remove and return the highest-priority item, or `undefined` if empty. */
  pop(): T | undefined {
    if (this.heap.length === 0) { return undefined; }
    const top = this.heap[0]!;
    const last = this.heap.pop()!;
    const lastSeq = this.entrySeq.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.entrySeq[0] = lastSeq;
      this.siftDown(0,);
    }
    return top;
  }

  /** Peek at the highest-priority item without removing it. */
  peek(): T | undefined {
    return this.heap[0];
  }

  /** Number of items currently in the queue. */
  get size(): number {
    return this.heap.length;
  }

  /** Drop all items. */
  clear(): void {
    this.heap.length = 0;
    this.entrySeq.length = 0;
  }

  /** Iterate in heap order (not sorted). */
  *[Symbol.iterator](): Generator<T, void, void> {
    for (let i = 0; i < this.heap.length; i++) { yield this.heap[i]!; }
  }

  private higher(i: number, j: number,): boolean {
    const cmp = this.compare(this.heap[i]!, this.heap[j]!,);
    if (cmp !== 0) { return cmp < 0; }
    return (this.entrySeq[i] ?? 0) < (this.entrySeq[j] ?? 0);
  }

  private siftUp(i: number,): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.higher(i, parent,)) { return; }
      this.swap(i, parent,);
      i = parent;
    }
  }

  private siftDown(i: number,): void {
    const n = this.heap.length;
    for (;;) {
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      let best = i;
      if (l < n && this.higher(l, best,)) { best = l; }
      if (r < n && this.higher(r, best,)) { best = r; }
      if (best === i) { return; }
      this.swap(i, best,);
      i = best;
    }
  }

  private swap(i: number, j: number,): void {
    const t = this.heap[i]!;
    const hp = this.heap[j]!;
    this.heap[i] = hp;
    this.heap[j] = t;
    const ts = this.entrySeq[i]!;
    const es = this.entrySeq[j]!;
    this.entrySeq[i] = es;
    this.entrySeq[j] = ts;
  }
}
