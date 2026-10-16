// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import { emojiRoutes, } from "../../routes/emoji";
import { listEmojiShortcodes, } from "./chat-utils/emoji";

describe("emojiRoutes", () => {
  test("GET /api/v1/emoji returns the registry as JSON", async () => {
    const app = new Elysia().use(emojiRoutes({ prefix: "/api/v1", },),) as unknown as Elysia;
    const res = await app.handle(
      new Request("http://localhost/api/v1/emoji",),
    );

    expect(res.status,).toBe(200,);

    const body = (await res.json()) as { data: unknown[] };
    expect(Array.isArray(body.data,),).toBe(true,);
    expect(body.data.length,).toBeGreaterThan(0,);
  });

  test("registry matches the client bundle exactly", async () => {
    const app = new Elysia().use(emojiRoutes({ prefix: "/api/v1", },),) as unknown as Elysia;
    const res = await app.handle(
      new Request("http://localhost/api/v1/emoji",),
    );

    const body = (await res.json()) as { data: { name: string; emoji: string }[] };
    const bundle = listEmojiShortcodes();
    expect(body.data,).toEqual(bundle.map(({ name, emoji, },) => ({ name, emoji, })),);
  });
});
