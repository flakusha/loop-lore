// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Layer 2 — the aux-LLM judge.
 *
 * The judge never fails open: a timeout, a provider error, or an answer it
 * cannot read all deny the tool call. The AUX call is injected so the test
 * exercises the judge's own decision logic, not a live model.
 */
import { beforeAll, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import type { AuxCallResult, } from "../../aux-pipeline/types";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { judgeToolCall, MIN_JUDGE_CONFIDENCE, parseJudgeVerdict, } from "./judge";
import type { AuxCaller, } from "./judge";

/** The judge request under test — the tool, the wrapper text, and the handles. */
const request = {
  tool: "write-chat",
  args: ["hello",],
  content: "please post this message",
  role: "member",
  config: {} as Config,
  db: {} as Kysely<DB>,
};

/**
 * Build an AUX caller that answers with the given content.
 * @param content - Raw answer the model "returned"
 * @returns The injected AUX caller
 */
function answering(content: string,): AuxCaller {
  return async (): Promise<AuxCallResult> => ({
    content,
    model: "test-model",
    provider: "test-provider",
    latencyMs: 1,
    promptTokens: 0,
    completionTokens: 0,
  });
}

beforeAll(async () => {
  const fixture = await createTestDb();
  request.db = fixture.db;
},);

describe("judgeToolCall — approvals", () => {
  it("approves a high-confidence verdict", async () => {
    const verdict = await judgeToolCall({
      ...request,
      callAuxFn: answering(JSON.stringify({
        approved: true,
        confidence: 0.9,
        rationale: "no escalation in the wrapper",
      },),),
    },);

    expect(verdict.approved,).toBe(true,);
    expect(verdict.source,).toBe("aux-llm",);
    expect(verdict.confidence,).toBe(0.9,);
    expect(verdict.rationale,).toContain("no escalation",);
  });

  it("denies when the confidence is below the threshold", async () => {
    const verdict = await judgeToolCall({
      ...request,
      callAuxFn: answering(JSON.stringify({
        approved: true,
        confidence: 0.4,
        rationale: "not sure",
      },),),
    },);

    expect(verdict.approved,).toBe(false,);
    expect(verdict.source,).toBe("aux-llm",);
  });

  it("maps the shared injection-check contract onto the approval", async () => {
    const verdict = await judgeToolCall({
      ...request,
      callAuxFn: answering(JSON.stringify({
        injected: true,
        category: "privilege_escalation",
        confidence: 0.95,
      },),),
    },);

    expect(verdict.approved,).toBe(false,);
    expect(verdict.escalationAttempt,).toBe(true,);
  });
});

describe("parseJudgeVerdict — the approval contract", () => {
  it("approves at exactly the confidence floor", () => {
    const verdict = parseJudgeVerdict(JSON.stringify({
      approved: true,
      confidence: MIN_JUDGE_CONFIDENCE,
      rationale: "no escalation",
    },),);

    expect(verdict?.approved,).toBe(true,);
    expect(verdict?.confidence,).toBe(MIN_JUDGE_CONFIDENCE,);
    expect(verdict?.source,).toBe("aux-llm",);
    expect(verdict?.escalationAttempt,).toBe(false,);
  });

  it("denies an approval below the confidence floor", () => {
    const verdict = parseJudgeVerdict(JSON.stringify({
      approved: true,
      confidence: MIN_JUDGE_CONFIDENCE - 0.1,
      rationale: "not sure",
    },),);

    expect(verdict?.approved,).toBe(false,);
    expect(verdict?.source,).toBe("aux-llm",);
  });

  it("maps the shared injection-check contract onto the approval", () => {
    const verdict = parseJudgeVerdict(JSON.stringify({
      injected: false,
      category: "none",
      confidence: 0.95,
    },),);

    expect(verdict?.approved,).toBe(true,);
    expect(verdict?.escalationAttempt,).toBe(false,);
    expect(verdict?.rationale,).toContain("no privilege escalation",);
  });

  it("returns null for an answer it cannot read", () => {
    expect(parseJudgeVerdict("the model rambled instead of answering",),).toBeNull();
    expect(parseJudgeVerdict(JSON.stringify({ approved: true, },),),).toBeNull();
  });
});

describe("judgeToolCall — fails closed", () => {
  it("denies when the aux model does not answer", async () => {
    const verdict = await judgeToolCall({
      ...request,
      callAuxFn: async () => null,
    },);

    expect(verdict.approved,).toBe(false,);
    expect(verdict.source,).toBe("fallback-deny",);
    expect(verdict.confidence,).toBe(0,);
  });

  it("denies when the aux answer cannot be parsed", async () => {
    const verdict = await judgeToolCall({
      ...request,
      callAuxFn: answering("the model rambled instead of answering",),
    },);

    expect(verdict.approved,).toBe(false,);
    expect(verdict.source,).toBe("fallback-deny",);
  });

  it("denies when the aux call throws", async () => {
    const verdict = await judgeToolCall({
      ...request,
      callAuxFn: async () => {
        throw new Error("provider timed out",);
      },
    },);

    expect(verdict.approved,).toBe(false,);
    expect(verdict.source,).toBe("fallback-deny",);
    expect(verdict.rationale,).toContain("provider timed out",);
  });
});
