// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the system_config key classifiers — restart-required,
 * per-chat overridable, and the decoration helper the admin UI renders.
 */
import { describe, expect, test, } from "bun:test";
import { decorateConfigEntry, } from "./config-keys";

describe("decorateConfigEntry", () => {
  test("flags restart-required and per-chat overridable keys", () => {
    const entry = decorateConfigEntry({
      key: "default_provider",
      value: "openai",
      description: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },);

    expect(entry.requires_restart,).toBe(true,);
    expect(entry.per_chat_overridable,).toBe(true,);
  });

  test("leaves unrelated keys unflagged", () => {
    const entry = decorateConfigEntry({
      key: "some_other_key",
      value: "x",
      description: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },);

    expect(entry.requires_restart,).toBe(false,);
    expect(entry.per_chat_overridable,).toBe(false,);
  });
});
