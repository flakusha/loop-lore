// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Pure-logic tests for the variantPicker Alpine slice
 * (TASK-wire-variant-picker-into-new-chat-form): the form select → slice
 * sync and the canonical `triple()` resolution the submit path persists.
 */
import { describe, expect, test, } from "bun:test";
import { ChatPurpose, ChatType, } from "../../../db/enums-core/users";
import { variantPicker, } from "./variants";

describe("variantPicker", () => {
  test("syncFromSelect maps standard to no selection", () => {
    variantPicker.selectVariant("rpg",);
    variantPicker.syncFromSelect("standard",);
    expect(variantPicker.selectedVariant,).toBeNull();
    expect(variantPicker.triple(),).toBeNull();
  });

  test("syncFromSelect accepts the rpg variants", () => {
    variantPicker.syncFromSelect("rpg",);
    expect(variantPicker.selectedVariant,).toBe("rpg",);
    expect(variantPicker.triple(),).not.toBeNull();
    variantPicker.syncFromSelect("rpg_group",);
    expect(variantPicker.selectedVariant,).toBe("rpg_group",);
  });

  test("triple resolves the canonical defaults for rpg variants", () => {
    variantPicker.syncFromSelect("rpg",);
    const rpg = variantPicker.triple()!;
    expect(rpg.variant,).toBe("rpg",);
    expect(rpg.chat_type,).toBe(ChatType.Direct,);
    expect(rpg.chat_purpose,).toBe(ChatPurpose.Rpg,);

    variantPicker.syncFromSelect("rpg_group",);
    const group = variantPicker.triple()!;
    expect(group.variant,).toBe("rpg_group",);
    expect(group.chat_type,).toBe(ChatType.Group,);
    expect(group.chat_purpose,).toBe(ChatPurpose.Rpg,);
  });

  test("registered on globalThis so x-data resolves the mount", () => {
    expect((globalThis as unknown as Record<string, unknown>).variantPicker,).toBe(variantPicker,);
  });
});
