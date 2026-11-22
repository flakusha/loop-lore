// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the system_config key classifiers — restart-required,
 * per-chat overridable, and the decoration helper the admin UI renders.
 */
import { EDITABLE_SYSTEM_CONFIG_KEYS, } from "@loop-lore/core/config/sections/menu-data";
import { describe, expect, test, } from "bun:test";
import { decorateConfigEntry, isSecretConfigKeyName, } from "./config-keys";

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

describe("EDITABLE_SYSTEM_CONFIG_KEYS", () => {
  test("names the four canonical flat system_config keys", () => {
    expect(EDITABLE_SYSTEM_CONFIG_KEYS,).toEqual({
      autorouteScenario: "autoroute_scenario",
      loreTokenBudget: "lore_token_budget",
      memoryTokenBudget: "memory_token_budget",
      modelRoles: "model_roles",
    },);
  });
});

describe("isSecretConfigKeyName", () => {
  test("treats token-budget keys as non-secret", () => {
    for (const key of ["lore_token_budget", "memory_token_budget", "loreTokenBudget", "memoryTokenBudget",]) {
      expect(isSecretConfigKeyName(key,),).toBe(false,);
    }
  });

  test("still classifies credential keys as secret", () => {
    for (const key of ["api_token", "password", "openai_api_key", "db.url",]) {
      expect(isSecretConfigKeyName(key,),).toBe(true,);
    }
  });
});
