// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the shared AUX pipeline system prompts.
 *
 * Pure constants — no fixtures, no I/O.
 */
import { describe, expect, test, } from "bun:test";
import { CHAT_TITLE_PROMPT, RAG_ASK_PROMPT, } from "./prompts";

describe("aux-pipeline prompts", () => {
  test("title prompt asks for a short title", () => {
    expect(CHAT_TITLE_PROMPT,).toContain("title",);
  });

  test("rag prompt anchors the answer in the provided context", () => {
    expect(RAG_ASK_PROMPT,).toContain("context",);
  });
});
