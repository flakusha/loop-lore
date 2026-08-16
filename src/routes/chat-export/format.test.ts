/**
 * Tests for chat-export formatting functions (markdown/json/html/plaintext).
 */
import { describe, expect, test, } from "bun:test";
import { formatHtml, formatJson, formatMarkdown, formatPlainText, } from "./format";
import type { MessageData, } from "./types";

function msg(partial: Partial<MessageData> & { content: string },): MessageData {
  const { content, ...rest } = partial;
  return {
    id: "m1",
    content,
    role: rest.role ?? "assistant",
    created_at: rest.created_at ?? "2026-01-01T00:00:00.000Z",
    display_name: rest.display_name ?? "Alice",
    model_id: rest.model_id ?? null,
    token_count_total: rest.token_count_total ?? 42,
    ...rest,
  };
}

const chat = { name: "Test <Chat>", type: "roleplay", mode: "chat", } as const;

describe("formatMarkdown", () => {
  test("emits chat header with name, date and type/mode", () => {
    const out = formatMarkdown(chat, [],);
    expect(out,).toContain("# Test <Chat>",);
    expect(out,).toContain("> Exported from loop-lore on ",);
    expect(out,).toContain("> Chat type: roleplay | Mode: chat",);
    expect(out,).toContain("---",);
  });

  test("uses display name for assistant messages", () => {
    const out = formatMarkdown(chat, [msg({ content: "hello", display_name: "Bob", },),],);
    expect(out,).toContain("### Bob",);
    expect(out,).toContain("hello",);
  });

  test("labels user messages as You", () => {
    const out = formatMarkdown(chat, [msg({ content: "hi", role: "user", },),],);
    expect(out,).toContain("### You",);
    expect(out,).not.toContain("### hi",);
  });

  test("groups consecutive messages under one author header", () => {
    const out = formatMarkdown(chat, [
      msg({ content: "a", role: "user", },),
      msg({ content: "b", role: "user", },),
      msg({ content: "c", display_name: "Alice", },),
    ],);
    const headers = out.split("\n",).filter(l => l.startsWith("### ",));
    expect(headers,).toEqual(["### You", "### Alice",],);
  });

  test("falls back to role when display name missing", () => {
    const out = formatMarkdown(chat, [msg({ content: "x", display_name: null, role: "assistant", },),],);
    expect(out,).toContain("### assistant",);
  });
});

describe("formatJson", () => {
  const chatJson = { id: "c1", name: "N", type: "type", mode: "mode", created_at: "t", } as const;

  test("serializes chat and message fields", () => {
    const out = formatJson(chatJson, [msg({ content: "hi", role: "user", model_id: "model-x", },),],);
    const parsed = JSON.parse(out,) as {
      chat: { id: string; name: string };
      messages: { role: string; author: string | null; model_id: string | null; token_count: number | null }[];
      exported_at: string;
    };
    expect(parsed.chat.id,).toBe("c1",);
    expect(parsed.messages[0]!.role,).toBe("user",);
    expect(parsed.messages[0]!.author,).toBe("Alice",);
    expect(parsed.messages[0]!.model_id,).toBe("model-x",);
    expect(parsed.messages[0]!.token_count,).toBe(42,);
    expect(parsed.exported_at,).toBeDefined();
  });

  test("pretty-prints with 2-space indent", () => {
    expect(formatJson(chatJson, [],),).toContain('\n  "chat":',);
  });

  test("returns empty object when serialization fails", () => {
    // content with circular reference impossible via MessageData, so force
    // failure by stubbing JSON.stringify.
    const realStringify = JSON.stringify;
    JSON.stringify = () => {
      throw new Error("boom",);
    };
    try {
      expect(formatJson(chatJson, [msg({ content: "x", },),],),).toBe("{}",);
    } finally {
      JSON.stringify = realStringify;
    }
  });
});

describe("formatHtml", () => {
  test("renders full document with escaped chat name", () => {
    const out = formatHtml(chat, [],);
    expect(out,).toContain("<!DOCTYPE html>",);
    expect(out,).toContain("<title>Test &lt;Chat&gt;</title>",);
    expect(out,).toContain("roleplay",);
    expect(out,).toContain("Exported from loop-lore",);
  });

  test("renders user message with user class and content escaped", () => {
    const out = formatHtml(chat, [msg({ content: "<script>alert(1)</script>", role: "user", },),],);
    expect(out,).toContain('class="message user"',);
    expect(out,).toContain("&lt;script&gt;alert(1)&lt;/script&gt;",);
    expect(out,).toContain('<span class="sender">You</span>',);
  });

  test("renders assistant message with assistant class and display name", () => {
    const out = formatHtml(chat, [msg({ content: "fine", display_name: "Bob", },),],);
    expect(out,).toContain('class="message assistant"',);
    expect(out,).toContain(">Bob<",);
  });
});

describe("formatPlainText", () => {
  test("emits header with name, type and exported date", () => {
    const out = formatPlainText(chat, [],);
    expect(out,).toContain("Test <Chat>",);
    expect(out,).toContain("Type: roleplay | Mode: chat",);
    expect(out,).toContain("Exported: ",);
  });

  test("emits author, time and content per message", () => {
    const out = formatPlainText(chat, [msg({ content: "payload", role: "user", },),],);
    expect(out,).toContain("[You] (",);
    expect(out,).toContain("payload",);
    expect(out,).toContain("---",);
  });
});
