// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the decision-model transport: response validation against the
 * asked questions and the graceful-null contract (refusals, timeouts,
 * non-loopback endpoints).
 *
 * Resource contract: fully in-memory and parallel-safe — stub fetch only,
 * no DB, no files, no ports, no mutated module state.
 */
import { describe, expect, test, } from "bun:test";
import { callDecisionModel, validateDecisionResponse, } from "./decision-client";
import type { DecisionQuestion, } from "./decision-client";

const CHOICE_Q: DecisionQuestion = {
  id: "intent",
  type: "choice",
  instructions: "intent",
  criteria: { greeting: null, question: null, command: null, roleplay: null, narrative: null, },
};

/** Measured local shape (llama-swap proxy, 2026-10-26): choice + noul, zero generated text. */
const GOLDEN = {
  model: "llama-d3-2b",
  answers: {
    kind: {
      type: "choice",
      choice: "code",
      probabilities: { code: 0.9966, math: 0.0003, chat: 0.003, },
      confidence: 0.9786,
    },
    reasoning: { type: "noul", noul: 0.034, },
  },
  usage: { input_tokens: 213, output_tokens: 0, },
};

const KIND_Q: DecisionQuestion = {
  id: "kind",
  type: "choice",
  instructions: "kind",
  criteria: { code: null, math: null, chat: null, },
};

function stubFetch(status: number, body: unknown,): typeof fetch {
  return (async () => new Response(JSON.stringify(body,), { status, },)) as unknown as typeof fetch;
}

describe("validateDecisionResponse", () => {
  test("accepts the measured golden shape", () => {
    const res = validateDecisionResponse(GOLDEN, [KIND_Q,],);
    expect(res?.model,).toBe("llama-d3-2b",);
    expect(res?.answers["kind"],).toMatchObject({ type: "choice", choice: "code", },);
    expect(res?.promptTokens,).toBe(213,);
    expect(res?.completionTokens,).toBe(0,);
  });

  test("rejects a choice outside the asked criteria", () => {
    const body = { ...GOLDEN, answers: { kind: { ...GOLDEN.answers.kind, choice: "nope", }, }, };
    expect(validateDecisionResponse(body, [KIND_Q,],),).toBeNull();
  });

  test("rejects out-of-range probabilities", () => {
    const body = {
      ...GOLDEN,
      answers: { kind: { ...GOLDEN.answers.kind, probabilities: { code: 1.5, }, }, },
    };

    expect(validateDecisionResponse(body, [KIND_Q,],),).toBeNull();
  });

  test("rejects a missing question and a type mismatch", () => {
    expect(validateDecisionResponse({ model: "m", answers: {}, usage: {}, }, [KIND_Q,],),).toBeNull();
    const mismatch = {
      ...GOLDEN,
      answers: { kind: { ...GOLDEN.answers.reasoning, }, },
    };

    expect(validateDecisionResponse(mismatch, [KIND_Q,],),).toBeNull();
  });

  test("rejects non-object bodies", () => {
    expect(validateDecisionResponse(null, [KIND_Q,],),).toBeNull();
    expect(validateDecisionResponse("ok", [KIND_Q,],),).toBeNull();
  });

  test("accepts score and noul answers", () => {
    const scoreQ: DecisionQuestion = { id: "s", type: "score", instructions: "s", levels: ["low", "high",], };
    const noulQ: DecisionQuestion = { id: "n", type: "noul", instructions: "n", };
    const res = validateDecisionResponse({
      model: "m",
      answers: {
        s: { type: "score", score: 1.5, probabilities: { low: 0.2, high: 0.8, }, },
        n: { type: "noul", noul: 0.9, },
      },
      usage: {},
    }, [scoreQ, noulQ,],);

    expect(res?.answers["s"],).toMatchObject({ type: "score", score: 1.5, },);
    expect(res?.answers["n"],).toMatchObject({ type: "noul", noul: 0.9, },);
  });
});

describe("callDecisionModel", () => {
  const base = {
    baseUrl: "http://localhost:7180/v1",
    model: "llama-d3-2b",
    state: [{ role: "user", content: "hi", },],
    questions: [CHOICE_Q,],
  } as const;

  test("returns the validated response on 200", async () => {
    const res = await callDecisionModel({
      ...base,
      fetchImpl: stubFetch(200, {
        model: "llama-d3-2b",
        answers: {
          intent: {
            type: "choice",
            choice: "greeting",
            probabilities: { greeting: 0.9, question: 0.1, command: 0, roleplay: 0, narrative: 0, },
            confidence: 0.8,
          },
        },
        usage: { input_tokens: 10, output_tokens: 0, },
      },),
    },);

    expect(res?.answers["intent"],).toMatchObject({ choice: "greeting", },);
  });

  test("resolves null on 400/401/501/502", async () => {
    for (const status of [400, 401, 501, 502,]) {
      const res = await callDecisionModel({ ...base, fetchImpl: stubFetch(status, {},), },);
      expect(res,).toBeNull();
    }
  });

  test("resolves null when fetch throws or the body is not JSON", async () => {
    const throwing = (async () => {
      throw new Error("down",);
    }) as unknown as typeof fetch;

    expect(await callDecisionModel({ ...base, fetchImpl: throwing, },),).toBeNull();
    const html = (async () => new Response("<html>", { status: 200, },)) as unknown as typeof fetch;
    expect(await callDecisionModel({ ...base, fetchImpl: html, },),).toBeNull();
  });

  test("resolves null on timeout", async () => {
    // Abort-aware hang: mirrors real fetch, which rejects when aborted.
    const hanging = ((_url: string, init?: { signal?: AbortSignal },) =>
      new Promise<Response>((_resolve, reject,) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted",),),);
      },)) as unknown as typeof fetch;

    const res = await callDecisionModel({ ...base, fetchImpl: hanging, timeoutMs: 10, },);
    expect(res,).toBeNull();
  });

  test("resolves null for non-loopback endpoints", async () => {
    let called = false;
    const spy = (async () => {
      called = true;
      return new Response("{}", { status: 200, },);
    }) as unknown as typeof fetch;

    expect(await callDecisionModel({ ...base, baseUrl: "http://example.com/v1", fetchImpl: spy, },),).toBeNull();
    expect(called,).toBe(false,);
  });
});
