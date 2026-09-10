// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the in-memory idempotency backend.
 *
 * Exercises the contract that the `idempotent()` factory depends on:
 * get/markInFlight/recordResponse/release/clear are all synchronous
 * (the table backend mirrors this contract, so the cross-instance behaviour
 * is verified in `idempotency-table.test.ts`).
 */

import { afterEach, beforeEach, describe, expect, test, vi, } from "bun:test";
import { createMemoryBackend, } from "./idempotency-memory";

const META = { method: "POST", route: "/api/x", userId: "user-1", };

describe("createMemoryBackend", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  },);
  afterEach(() => {
    vi.useRealTimers();
  },);

  test("returns null for absent keys", () => {
    const backend = createMemoryBackend(60_000,);
    expect(backend.get("k",),).toBeNull();
  });

  test("markInFlight reserves a slot that get returns with inFlight=true", () => {
    const backend = createMemoryBackend(60_000,);
    const entry = backend.markInFlight("k", META,);
    expect(entry.inFlight,).toBe(true,);
    expect(backend.get("k",)?.inFlight,).toBe(true,);
  });

  test("recordResponse transitions the slot from inFlight to completed", () => {
    const backend = createMemoryBackend(60_000,);
    backend.markInFlight("k", META,);
    backend.recordResponse("k", META, {
      status: 201,
      headers: { "x-trace": "t", },
      body: "payload",
      startedAt: Date.now(),
    },);
    const entry = backend.get("k",);
    expect(entry?.inFlight,).toBe(false,);
    expect(entry?.status,).toBe(201,);
    expect(entry?.body,).toBe("payload",);
    expect(entry?.headers["x-trace"],).toBe("t",);
  });

  test("release drops the slot so get returns null", () => {
    const backend = createMemoryBackend(60_000,);
    backend.markInFlight("k", META,);
    backend.release("k", META,);
    expect(backend.get("k",),).toBeNull();
  });

  test("TTL expiry drops completed entries past their TTL", () => {
    const backend = createMemoryBackend(1_000,);
    backend.markInFlight("k", META,);
    backend.recordResponse("k", META, {
      status: 200,
      headers: {},
      body: "ok",
      startedAt: Date.now(),
    },);
    expect(backend.get("k",)?.body,).toBe("ok",);
    // Advance past the 1s TTL — completedAt is captured at recordResponse
    // time, so advancing the system clock by 2s guarantees expiry.
    vi.advanceTimersByTime(2_000,);
    expect(backend.get("k",),).toBeNull();
  });

  test("clear removes every entry (in-flight + completed)", () => {
    const backend = createMemoryBackend(60_000,);
    backend.markInFlight("a", META,);
    backend.recordResponse("b", META, {
      status: 200,
      headers: {},
      body: "ok",
      startedAt: Date.now(),
    },);
    backend.clear();
    expect(backend.get("a",),).toBeNull();
    expect(backend.get("b",),).toBeNull();
  });
});
