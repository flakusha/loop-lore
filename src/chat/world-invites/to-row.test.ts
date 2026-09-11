// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Tests for the world invite row mapper (pure, no DB). */
import { describe, expect, test, } from "bun:test";
import { InviteStatus, } from "../../db/enums";
import { toRow, } from "./to-row";

describe("toRow", () => {
  test("maps snake_case columns to camelCase with worldId", () => {
    const out = toRow({
      id: "inv-1",
      world_id: "world-1",
      code: "WXYZ",
      created_by: "user-1",
      created_at: "2026-01-01",
      expires_at: "2026-03-01",
      max_uses: 1,
      uses: 0,
      status: InviteStatus.Active,
    },);
    expect(out,).toEqual({
      id: "inv-1",
      worldId: "world-1",
      code: "WXYZ",
      createdBy: "user-1",
      createdAt: "2026-01-01",
      expiresAt: "2026-03-01",
      maxUses: 1,
      uses: 0,
      status: "active",
    },);
  });

  test("preserves nulls for anonymous, open-ended invites", () => {
    const out = toRow({
      id: "inv-2",
      world_id: "world-1",
      code: "OPEN",
      created_by: null,
      created_at: "2026-01-01",
      expires_at: null,
      max_uses: null,
      uses: 0,
      status: InviteStatus.Revoked,
    },);
    expect(out.createdBy,).toBeNull();
    expect(out.expiresAt,).toBeNull();
    expect(out.maxUses,).toBeNull();
    expect(out.status,).toBe("revoked",);
  });
});
