import { describe, expect, test, } from "bun:test";

import {
  MessageSeenState,
  type MessageSeenState as SeenState,
  messageSeenStateMachine,
} from "./flags.js";

describe("MessageSeenState", () => {
  test("constants are as defined", () => {
    expect(MessageSeenState.Unseen,).toBe("unseen",);
    expect(MessageSeenState.Processing,).toBe("processing",);
    expect(MessageSeenState.Seen,).toBe("seen",);
  });

  test("initial state is Unseen", () => {
    expect(messageSeenStateMachine.def.initial,).toBe(MessageSeenState.Unseen,);
  });

  test("no terminal states", () => {
    expect(messageSeenStateMachine.def.terminal,).toEqual([],);
  });

  test("unseen → processing", () => {
    expect(messageSeenStateMachine.canTransition(MessageSeenState.Unseen, MessageSeenState.Processing,),)
      .toBe(true,);
  });

  test("unseen → seen (direct)", () => {
    expect(messageSeenStateMachine.canTransition(MessageSeenState.Unseen, MessageSeenState.Seen,),)
      .toBe(true,);
  });

  test("processing → seen", () => {
    expect(messageSeenStateMachine.canTransition(MessageSeenState.Processing, MessageSeenState.Seen,),)
      .toBe(true,);
  });

  test("processing → unseen (re-queued)", () => {
    expect(messageSeenStateMachine.canTransition(MessageSeenState.Processing, MessageSeenState.Unseen,),)
      .toBe(true,);
  });

  test("seen → unseen (reset)", () => {
    expect(messageSeenStateMachine.canTransition(MessageSeenState.Seen, MessageSeenState.Unseen,),)
      .toBe(true,);
  });

  test("seen cannot transition to processing directly", () => {
    expect(messageSeenStateMachine.canTransition(MessageSeenState.Seen, MessageSeenState.Processing,),)
      .toBe(false,);
  });

  test("unseen cannot transition to archived", () => {
    expect(messageSeenStateMachine.canTransition(MessageSeenState.Unseen, "archived" as any,),)
      .toBe(false,);
  });

  test("full transition closure", () => {
    const all = new Set<SeenState>();
    for (const state of Object.values(MessageSeenState,)) {
      for (const target of messageSeenStateMachine.def.transitions[state]) {
        all.add(target,);
      }
    }
    // Every state reachable from some state
    expect(all,).toEqual(new Set(Object.values(MessageSeenState,),),);
  });
});
