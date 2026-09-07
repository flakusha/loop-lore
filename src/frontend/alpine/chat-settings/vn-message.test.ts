// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import type { Message, } from "../types";
import { toVnMessage, } from "./vn";

const msg = (overrides: Partial<Message> = {},): Message => ({
  id: "m1",
  role: "assistant",
  content: "hello",
  created_at: "2024-01-01T00:00:00Z",
  ...overrides,
} as Message);

const vnAttachment = {
  assetId: "a1",
  order: 0,
  caption: "",
  label: "message-attachment",
  url: "http://x/y.png",
  filename: "y.png",
  mimeType: "image/png",
  type: "image",
  width: 64,
  height: 64,
};

describe("toVnMessage", () => {
  test("passes through known roles", () => {
    for (const role of ["assistant", "user", "system",] as const) {
      const out = toVnMessage(msg({ role, },),);
      expect(out.role,).toBe(role,);
      expect(out.id,).toBe("m1",);
      expect(out.content,).toBe("hello",);
    }
  });

  test("maps unknown roles to narration", () => {
    expect(toVnMessage(msg({ role: "char", },),).role,).toBe("narration",);
    expect(toVnMessage(msg({ role: "", },),).role,).toBe("narration",);
    expect(toVnMessage(msg({ role: "tool", },),).role,).toBe("narration",);
  });

  test("carries name, thinking, and attachments through", () => {
    const out = toVnMessage(msg({
      role: "assistant",
      actor_name: "Aria",
      thinking: "hmm",
      attachments: [vnAttachment,],
    },),);
    expect(out.name,).toBe("Aria",);
    expect(out.thinking,).toBe("hmm",);
    expect(out.attachments,).toEqual([vnAttachment,],);
  });

  test("handles missing optional fields", () => {
    const out = toVnMessage(msg({ role: "user", actor_name: undefined, thinking: undefined, },),);
    expect(out.name,).toBeUndefined();
    expect(out.thinking,).toBeUndefined();
  });

  test("handles unicode content", () => {
    const out = toVnMessage(msg({ content: "影の酒場で乾杯 🍶", actor_name: "案内人", },),);
    expect(out.content,).toBe("影の酒場で乾杯 🍶",);
    expect(out.name,).toBe("案内人",);
  });
});
