// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Tests for the chat invite row mapper (pure, no DB). */
import { describe, expect, test, } from "bun:test";
import { InviteStatus, } from "../../db/enums";
import { toRow, } from "./to-row";

describe("toRow", () => {
  test("maps snake_case columns to camelCase", () => {
    const out = toRow({
      id: "inv-1",
      chat_id: "chat-1",
      code: "ABC123",
      created_by: "user-1",
      created_at: "2026-01-01",
      expires_at: "2026-02-01",
      max_uses: 5,
      uses: 2,
      status: InviteStatus.Active,
    },);
    expect(out,).toEqual({
      id: "inv-1",
      chatId: "chat-1",
      code: "ABC123",
      createdBy: "user-1",
      createdAt: "2026-01-01",
      expiresAt: "2026-02-01",
      maxUses: 5,
      uses: 2,
      status: "active",
    },);
  });

  test("preserves nulls for anonymous, open-ended invites", () => {
    const out = toRow({
      id: "inv-2",
      chat_id: "chat-1",
      code: "OPEN",
      created_by: null,
      created_at: "2026-01-01",
      expires_at: null,
      max_uses: null,
      uses: 0,
      status: InviteStatus.Active,
    },);
    expect(out.createdBy,).toBeNull();
    expect(out.expiresAt,).toBeNull();
    expect(out.maxUses,).toBeNull();
  });
});
