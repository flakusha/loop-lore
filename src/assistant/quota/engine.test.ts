// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the assistant quota engine: boundary allow, over-limit reject,
 * per-user isolation, lazy window reset, unauthenticated refusal, and the
 * command-layer gate's denial shape.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import { ASSISTANT_QUOTA_DEFAULTS, } from "../../config/sections/assistant";
import { createLogger, } from "../../logger";
import { enforceQuota, initAssistantQuota, QuotaExceededError, resetAssistantQuota, } from "./engine";
import { quotaGate, } from "./gate";
import { configureQuotaStorage, quotaStorageOptions, } from "./storage";

const T0 = 1_700_000_000_000;
const WINDOW = 60_000;

beforeAll(() => {
  createLogger({ level: "error", },);
},);

beforeEach(() => {
  configureQuotaStorage({ windowMs: WINDOW, limitPerWindow: 10, },);
},);

afterEach(() => {
  configureQuotaStorage({ windowMs: 24 * 60 * 60 * 1000, limitPerWindow: 200, },);
},);

describe("enforceQuota", () => {
  test("allows spend up to the exact limit boundary", () => {
    // adapt (10) fits a limit of 10 exactly.
    enforceQuota("user-a", "adapt", T0,);
    // A second charge of ANY cost now exceeds the window.
    expect(() => enforceQuota("user-a", "duplicate", T0,)).toThrow(QuotaExceededError,);
  });

  test("rejects when the cost does not fit and reports details", () => {
    enforceQuota("user-b", "rag-ask", T0,); // 6
    try {
      enforceQuota("user-b", "adapt", T0,); // 10, only 4 left
      expect.unreachable();
    } catch (error) {
      expect(error,).toBeInstanceOf(QuotaExceededError,);
      const details = (error as QuotaExceededError).details;
      expect(details.needed,).toBe(10,);
      expect(details.available,).toBe(0,);
      expect(details.operation,).toBe("adapt",);
      expect(details.resetsAt,).toBe(T0 + WINDOW,);
    }
  });

  test("isolates users — one user's spend never charges another", () => {
    enforceQuota("user-a", "adapt", T0,); // exhausts user-a
    // user-b still has a full window.
    enforceQuota("user-b", "adapt", T0,);
  });

  test("resets lazily when the window elapses", () => {
    enforceQuota("user-c", "adapt", T0,); // 10/10
    expect(() => enforceQuota("user-c", "duplicate", T0 + WINDOW - 1,)).toThrow(QuotaExceededError,);
    // Past the window the same user gets a fresh 10.
    enforceQuota("user-c", "adapt", T0 + WINDOW,);
  });

  test("refuses an unauthenticated caller", () => {
    expect(() => enforceQuota(null, "rag-search", T0,)).toThrow(QuotaExceededError,);
  });

  test("resetAssistantQuota restores the window", () => {
    enforceQuota("user-d", "adapt", T0,);
    resetAssistantQuota("user-d",);
    enforceQuota("user-d", "adapt", T0,);
  });
});

describe("initAssistantQuota", () => {
  test("applies the section values", () => {
    initAssistantQuota({ quotaWindowMs: 60_000, quotaLimitPerWindow: 7, },);
    expect(quotaStorageOptions(),).toEqual({ windowMs: 60_000, limitPerWindow: 7, },);
  });

  test("falls back to quota defaults when the section is missing", () => {
    // Stored configs predating the assistant section must boot, not crash.
    initAssistantQuota(undefined,);
    expect(quotaStorageOptions(),).toEqual({
      windowMs: ASSISTANT_QUOTA_DEFAULTS.quotaWindowMs,
      limitPerWindow: ASSISTANT_QUOTA_DEFAULTS.quotaLimitPerWindow,
    },);

    initAssistantQuota(null,);
    expect(quotaStorageOptions(),).toEqual({
      windowMs: ASSISTANT_QUOTA_DEFAULTS.quotaWindowMs,
      limitPerWindow: ASSISTANT_QUOTA_DEFAULTS.quotaLimitPerWindow,
    },);
  });

  test("fills per field when the section is partial", () => {
    initAssistantQuota({} as never,);
    expect(quotaStorageOptions(),).toEqual({
      windowMs: ASSISTANT_QUOTA_DEFAULTS.quotaWindowMs,
      limitPerWindow: ASSISTANT_QUOTA_DEFAULTS.quotaLimitPerWindow,
    },);

    initAssistantQuota({ quotaWindowMs: 1_000, } as never,);
    expect(quotaStorageOptions(),).toEqual({
      windowMs: 1_000,
      limitPerWindow: ASSISTANT_QUOTA_DEFAULTS.quotaLimitPerWindow,
    },);

    initAssistantQuota({ quotaLimitPerWindow: 5, } as never,);
    expect(quotaStorageOptions(),).toEqual({
      windowMs: ASSISTANT_QUOTA_DEFAULTS.quotaWindowMs,
      limitPerWindow: 5,
    },);
  });

  test("enforces quota under a partial section (no NaN, no fail-open)", () => {
    initAssistantQuota({} as never,);
    const { windowMs, limitPerWindow, } = quotaStorageOptions();
    expect(Number.isFinite(windowMs,),).toBe(true,);
    expect(Number.isFinite(limitPerWindow,),).toBe(true,);
    // Spend the whole window; the next call must reject instead of
    // returning NaN or allowing unlimited spend.
    for (let i = 0; i < limitPerWindow; i++) {
      enforceQuota("partial-user", "asset-preview", T0,);
    }

    expect(() => enforceQuota("partial-user", "asset-preview", T0,)).toThrow(QuotaExceededError,);
  });
});

describe("quotaGate", () => {
  test("returns null and deducts while budget remains", () => {
    expect(quotaGate("user-e", "rag-search",),).toBeNull();
    expect(quotaGate("user-e", "rag-search",),).toBeNull();
  });

  test("returns a denial result once the window is exhausted", () => {
    // quotaGate uses the real clock; pin a huge window so the T0 spend stays
    // inside it and the exhausted state is what the gate sees.
    configureQuotaStorage({ windowMs: 100 * 365 * 24 * 60 * 60 * 1000, limitPerWindow: 10, },);
    enforceQuota("user-f", "adapt", T0,); // 10/10
    const denial = quotaGate("user-f", "rag-search",);
    expect(denial,).not.toBeNull();
    expect(denial?.handled,).toBe(true,);
    expect(denial?.systemMessage,).toContain("Quota exceeded",);
    expect(denial?.systemMessage,).toContain("rag-search",);
  });
});
