// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { PriorityQueue, } from "./priority-queue";

interface Item {
  key: number;
  tag: string;
}

describe("PriorityQueue", () => {
  test("pop returns the smallest-key item first", () => {
    const q = new PriorityQueue<Item>();
    q.push({ key: 5, tag: "b", },);
    q.push({ key: 1, tag: "a", },);
    q.push({ key: 3, tag: "c", },);
    expect(q.pop(),).toEqual({ key: 1, tag: "a", },);
    expect(q.pop(),).toEqual({ key: 3, tag: "c", },);
    expect(q.pop(),).toEqual({ key: 5, tag: "b", },);
    expect(q.pop(),).toBeUndefined();
  });

  test("FIFO tie-break by insertion order", () => {
    const q = new PriorityQueue<Item>();
    q.push({ key: 5, tag: "first", },);
    q.push({ key: 5, tag: "second", },);
    q.push({ key: 5, tag: "third", },);
    expect(q.pop(),).toEqual({ key: 5, tag: "first", },);
    expect(q.pop(),).toEqual({ key: 5, tag: "second", },);
    expect(q.pop(),).toEqual({ key: 5, tag: "third", },);
  });

  test("size, peek, clear", () => {
    const q = new PriorityQueue<Item>();
    expect(q.size,).toBe(0,);
    expect(q.peek(),).toBeUndefined();
    q.push({ key: 2, tag: "x", },);
    q.push({ key: 1, tag: "y", },);
    expect(q.size,).toBe(2,);
    expect(q.peek(),).toEqual({ key: 1, tag: "y", },);
    expect(q.pop(),).toEqual({ key: 1, tag: "y", },);
    expect(q.size,).toBe(1,);
    q.clear();
    expect(q.size,).toBe(0,);
    expect(q.peek(),).toBeUndefined();
  });

  test("cap throws when exceeded", () => {
    const q = new PriorityQueue<Item>({ cap: 2, },);
    q.push({ key: 1, tag: "a", },);
    q.push({ key: 2, tag: "b", },);
    expect(() => q.push({ key: 3, tag: "c", },)).toThrow(RangeError,);
  });

  test("ordering is preserved under many push/pop operations", () => {
    const q = new PriorityQueue<Item>();
    const N = 100;
    for (let i = 0; i < N; i++) { q.push({ key: (i * 7 + 13) % N, tag: `t${i}`, },); }
    let prev = -Infinity;
    while (q.size > 0) {
      const v = q.pop()!;
      expect(v.key,).toBeGreaterThanOrEqual(prev,);
      prev = v.key;
    }
  });

  test("custom comparator (descending)", () => {
    const q = new PriorityQueue<Item>({ compare: (a, b,) => b.key - a.key, },);
    q.push({ key: 1, tag: "a", },);
    q.push({ key: 5, tag: "b", },);
    q.push({ key: 3, tag: "c", },);
    expect(q.pop(),).toEqual({ key: 5, tag: "b", },);
    expect(q.pop(),).toEqual({ key: 3, tag: "c", },);
    expect(q.pop(),).toEqual({ key: 1, tag: "a", },);
  });

  test("iterator yields heap order, not sorted", () => {
    const q = new PriorityQueue<Item>();
    q.push({ key: 1, tag: "a", },);
    q.push({ key: 2, tag: "b", },);
    q.push({ key: 3, tag: "c", },);
    const tags = Array.from(q,).map((i,) => i.tag);
    expect(tags.length,).toBe(3,);
    expect([...tags,].sort(),).toEqual(["a", "b", "c",],);
  });
});
