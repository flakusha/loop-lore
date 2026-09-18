// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { LlmRequestState, llmRequestStateMachine, } from "./message-state-machine";

describe("llmRequestStateMachine", () => {
  test("initial state is pending", () => {
    expect(llmRequestStateMachine.def.initial,).toBe(LlmRequestState.Pending,);
  });

  test("terminal states are complete/failed/cancelled", () => {
    expect(new Set(llmRequestStateMachine.def.terminal,),).toEqual(
      new Set([
        LlmRequestState.Complete,
        LlmRequestState.Failed,
        LlmRequestState.Cancelled,
      ],),
    );
  });

  test("happy path: pending → queued → generating → complete", () => {
    expect(llmRequestStateMachine.canTransition(LlmRequestState.Pending, LlmRequestState.Queued,),).toBe(true,);
    expect(llmRequestStateMachine.canTransition(LlmRequestState.Queued, LlmRequestState.Generating,),).toBe(true,);
    expect(llmRequestStateMachine.canTransition(LlmRequestState.Generating, LlmRequestState.Complete,),).toBe(true,);
  });

  test("scheduled detours through queued before generating", () => {
    expect(llmRequestStateMachine.canTransition(LlmRequestState.Pending, LlmRequestState.Scheduled,),).toBe(true,);
    expect(llmRequestStateMachine.canTransition(LlmRequestState.Scheduled, LlmRequestState.Queued,),).toBe(true,);
    expect(llmRequestStateMachine.canTransition(LlmRequestState.Scheduled, LlmRequestState.Generating,),).toBe(false,);
  });

  test("pause / resume cycle: generating → paused → queued → generating", () => {
    expect(llmRequestStateMachine.canTransition(LlmRequestState.Generating, LlmRequestState.Paused,),).toBe(true,);
    expect(llmRequestStateMachine.canTransition(LlmRequestState.Paused, LlmRequestState.Queued,),).toBe(true,);
    expect(llmRequestStateMachine.canTransition(LlmRequestState.Queued, LlmRequestState.Generating,),).toBe(true,);
  });

  test("cancel is reachable from every non-terminal state", () => {
    const nonTerminal = llmRequestStateMachine.def.values.filter((v,) =>
      !(llmRequestStateMachine.def.terminal as readonly string[]).includes(v,)
    );
    for (const s of nonTerminal) {
      expect(llmRequestStateMachine.canTransition(s as LlmRequestState, LlmRequestState.Cancelled,),)
        .toBe(true,);
    }
  });

  test("terminal states have no outgoing transitions", () => {
    for (const s of llmRequestStateMachine.def.terminal) {
      expect(llmRequestStateMachine.def.transitions[s],).toEqual([] as readonly LlmRequestState[],);
    }
  });

  test("every state is reachable", () => {
    const all = new Set<LlmRequestState>();
    for (const state of llmRequestStateMachine.def.values) {
      for (const target of llmRequestStateMachine.def.transitions[state]) { all.add(target,); }
    }
    // The initial state is reachable trivially.
    all.add(llmRequestStateMachine.def.initial,);
    expect(all,).toEqual(new Set(llmRequestStateMachine.def.values,),);
  });
});
