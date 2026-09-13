// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { beforeAll, describe, expect, it, } from "bun:test";
import type { GenerateRequest, } from "../../generation/providers/types";
import { createLogger, } from "../../logger";
import { type CommandContext, getCommand, } from "./registry";
import { runSummarize, } from "./summarize";

beforeAll(() => {
  createLogger({ level: "error", },);
},);

function msgs(count: number,): CommandContext["messages"] {
  return Array.from({ length: count, }, (_, i,) => ({
    id: `m${i}`,
    role: i % 2 === 0 ? "user" : "assistant",
    content: `message ${i} with substance`,
    created_at: new Date(2026, 0, 1, i,).toISOString(),
  }),);
}

describe("summarize command", () => {
  it("is registered under summarize and sum", () => {
    expect(getCommand("summarize",),).toBeDefined();
    expect(getCommand("sum",),).toBeDefined();
  });

  it("reports when there is nothing to summarize", async () => {
    const result = await runSummarize([], { chatId: "c1", }, {},);
    expect(result.systemMessage,).toBe("No messages to summarize.",);
  });

  it("returns the LLM output verbatim when complete is provided", async () => {
    let captured: GenerateRequest | undefined;
    const complete = async (req: GenerateRequest,): Promise<{ content: string }> => {
      captured = req;
      return { content: "Users asked about quests; no decisions yet.", };
    };
    const result = await runSummarize(["4",], { chatId: "c1", messages: msgs(4,), }, { complete, },);
    expect(captured?.messages[1]?.content,).toContain("message 0 with substance",);
    expect(result.systemMessage,).toContain("Users asked about quests;",);
    expect(result.systemMessage,).not.toContain("LLM unavailable",);
    expect(result.actionPayload,).toMatchObject({ count: 4, },);
  });

  it("caps the transcript at the requested count", async () => {
    let captured: GenerateRequest | undefined;
    const complete = async (req: GenerateRequest,): Promise<{ content: string }> => {
      captured = req;
      return { content: "ok", };
    };
    await runSummarize(["3",], { chatId: "c1", messages: msgs(6,), }, { complete, },);
    expect(captured?.messages[1]?.content,).toContain("message 5 with substance",);
    expect(captured?.messages[1]?.content,).not.toContain("message 0 with substance",);
  });

  it("falls back to the extractive summary when the LLM throws", async () => {
    const complete = async (): Promise<{ content: string }> => {
      throw new Error("provider down",);
    };
    const result = await runSummarize([], { chatId: "c1", messages: msgs(2,), }, { complete, },);
    expect(result.systemMessage,).toContain("**User messages:**",);
  });

  it("falls back to the extractive summary when the LLM returns empty", async () => {
    const complete = async (): Promise<{ content: string }> => ({ content: "   ", });
    const result = await runSummarize([], { chatId: "c1", messages: msgs(2,), }, { complete, },);
    expect(result.systemMessage,).toContain("**User messages:**",);
  });

  it("falls back to the extractive summary with no deps", async () => {
    const result = await runSummarize(["5",], { chatId: "c1", messages: msgs(2,), }, {},);
    expect(result.systemMessage,).toContain("(last 2 messages):",);
  });
  it("clamps a zero count to the last message", async () => {
    const result = await runSummarize(["0",], { chatId: "c1", messages: msgs(3,), }, {},);
    expect(result.systemMessage,).toContain("(last 1 messages):",);
  });

  it("clamps a negative count to the last message", async () => {
    const result = await runSummarize(["-5",], { chatId: "c1", messages: msgs(3,), }, {},);
    expect(result.systemMessage,).toContain("(last 1 messages):",);
    expect(result.systemMessage,).not.toContain("(last -5 messages):",);
  });

  it("truncates long messages in the LLM transcript", async () => {
    let captured: GenerateRequest | undefined;
    const complete = async (req: GenerateRequest,): Promise<{ content: string }> => {
      captured = req;
      return { content: "ok", };
    };
    const long = "y".repeat(1200,);
    const messages = [{ id: "m1", role: "user", content: long, created_at: new Date().toISOString(), },];
    await runSummarize([], { chatId: "c1", messages, }, { complete, },);
    const transcript = captured?.messages[1]?.content ?? "";
    expect(transcript,).toContain("y".repeat(500,),);
    expect(transcript,).not.toContain("y".repeat(501,),);
  });
  it("maps --format to the system prompt variant", async () => {
    const seen: string[] = [];
    const complete = async (req: GenerateRequest,): Promise<{ content: string }> => {
      seen.push(String(req.messages[0]?.content ?? "",),);
      return { content: "ok", };
    };
    const ctx = { chatId: "c1", messages: msgs(2,), };
    await runSummarize(["--format", "tldr",], ctx, { complete, },);
    await runSummarize(["--format", "bullets",], ctx, { complete, },);
    await runSummarize(["--format", "detailed",], ctx, { complete, },);
    await runSummarize([], ctx, { complete, },);
    expect(seen[0],).toContain("one or two sentences",);
    expect(seen[1],).toContain("bullet list",);
    expect(seen[2],).toContain("in detail",);
    expect(seen[3],).toContain("concisely",);
  });

  it("reports the format in the action payload", async () => {
    const complete = async (): Promise<{ content: string }> => ({ content: "ok", });
    const result = await runSummarize(
      ["--format", "bullets",],
      { chatId: "c1", messages: msgs(2,), },
      { complete, },
    );
    expect(result.actionPayload,).toMatchObject({ format: "bullets", },);
  });

  it("falls back to concise on an unknown format", async () => {
    let captured = "";
    const complete = async (req: GenerateRequest,): Promise<{ content: string }> => {
      captured = String(req.messages[0]?.content ?? "",);
      return { content: "ok", };
    };
    await runSummarize(["--format", "haiku",], { chatId: "c1", messages: msgs(2,), }, { complete, },);
    expect(captured,).toContain("concisely",);
  });

  it("ignores --format in the extractive fallback", async () => {
    const result = await runSummarize(
      ["--format", "tldr",],
      { chatId: "c1", messages: msgs(2,), },
      {},
    );
    expect(result.systemMessage,).toContain("(last 2 messages):",);
  });
});
