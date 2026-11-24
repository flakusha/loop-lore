// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { requireChatAccess, } from "./access";

describe("chat-sections/access — requireChatAccess", () => {
  test("rejects an unauthenticated caller before any database lookup", async () => {
    const result = await requireChatAccess({ userId: null, }, {} as never,);

    expect(result,).toBeInstanceOf(Response,);
    expect((result as Response).status,).toBe(401,);
  });
});
