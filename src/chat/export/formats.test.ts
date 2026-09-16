// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import type { MessageData, } from "../../routes/chat-export/types";
import { exportChat, type ExportPayload, } from "./formats";

const messagesFixture: MessageData[] = [
  {
    id: "m-1",
    role: "user",
    content: "Hello there!",
    created_at: "2026-01-01T00:00:00.000Z",
    display_name: "Alice",
    model_id: null,
    token_count_total: null,
  },
  {
    id: "m-2",
    role: "assistant",
    content: "General Kenobi!",
    created_at: "2026-01-01T00:00:05.000Z",
    display_name: "GM",
    model_id: "gpt-test",
    token_count_total: 4,
  },
];

const payloadFixture: ExportPayload = {
  chat: {
    id: "chat-1",
    name: "Sample Chat",
    type: "roleplay",
    mode: "chat",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  messages: messagesFixture,
};

describe("exportChat — json", () => {
  test("round-trips through JSON.parse", () => {
    const out = exportChat(payloadFixture, "json",);
    const parsed = JSON.parse(out,) as {
      chat: ExportPayload["chat"];
      messages: MessageData[];
      exported_at: string;
    };
    expect(parsed.chat,).toEqual(payloadFixture.chat,);
    expect(parsed.messages,).toEqual(payloadFixture.messages,);
    expect(parsed.exported_at,).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(out,).toContain('\n  "chat":',);
  });
});

describe("exportChat — yaml", () => {
  test("includes chat metadata and both messages", () => {
    const out = exportChat(payloadFixture, "yaml",);
    expect(out,).toContain("name: Sample Chat",);
    expect(out,).toContain("role: user",);
    expect(out,).toContain("Hello there!",);
    expect(out,).toContain("General Kenobi!",);
    expect(out,).toContain("model: gpt-test",);
  });
});

describe("exportChat — toml", () => {
  test("emits a [chat] block plus [[message]] entries", () => {
    const out = exportChat(payloadFixture, "toml",);
    expect(out,).toContain("[chat]",);
    expect(out,).toContain("name = \"Sample Chat\"",);
    expect(out,).toMatch(/\[\[message\]\][\s\S]*role = "user"/,);
    expect(out,).toMatch(/\[\[message\]\][\s\S]*role = "assistant"/,);
    expect(out,).toContain("Hello there!",);
    expect(out,).toContain("General Kenobi!",);
    expect(out,).toContain("model = \"gpt-test\"",);
  });
});

describe("exportChat — md", () => {
  test("emits a header, metadata block, and per-author sections", () => {
    const out = exportChat(payloadFixture, "md",);
    expect(out,).toContain("# Sample Chat",);
    expect(out,).toContain("> Exported from loop-lore on",);
    expect(out,).toContain("### Alice",);
    expect(out,).toContain("Hello there!",);
    expect(out,).toContain("### GM",);
    expect(out,).toContain("General Kenobi!",);
  });

  test("labels user messages as 'You' when display_name is absent", () => {
    const out = exportChat(
      {
        ...payloadFixture,
        messages: [
          {
            id: "m-anon",
            role: "user",
            content: "anon hi",
            created_at: "2026-01-01T00:00:00.000Z",
            display_name: null,
            model_id: null,
            token_count_total: null,
          },
        ],
      },
      "md",
    );
    expect(out,).toContain("### You",);
    expect(out,).toContain("anon hi",);
  });
});

describe("exportChat — validation", () => {
  test("rejects unsupported format", () => {
    expect(() => exportChat(payloadFixture, "xml" as never,),).toThrow(/Unsupported export format/);
  });
});