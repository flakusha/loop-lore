// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Wiring tests for FEAT-048: ensure chat lifecycle service operations fan out
 * plugin events through emitPluginEvent. We exercise the emit helper directly
 * with a synthetic handler buffer (the wiring call sites in
 * src/chat/service/crud/{create,delete,archive}.ts and src/chat/service/write.ts
 * all call into the same dispatcher).
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";

import { emitPluginEvent, } from "./event-bus";
import type { EventHandlerDefinition, } from "./types";

describe("FEAT-048: chat lifecycle plugin events", () => {
  let liveHandlers: EventHandlerDefinition[];

  beforeEach(() => {
    liveHandlers = [];
  },);

  afterEach(() => {
    liveHandlers = [];
  },);

  test("emitPluginEvent invokes registered chat.created handler with payload", async () => {
    const seen: unknown[] = [];
    liveHandlers.push({
      event: "chat.created",
      handler: async (data: unknown) => { seen.push(data,); },
    },);

    const invoked = await emitPluginEvent(
      liveHandlers,
      "chat.created",
      { chatId: "abc", name: "Wired", createdBy: "u1", },
    );

    expect(invoked,).toBe(1,);
    expect(seen,).toEqual([{ chatId: "abc", name: "Wired", createdBy: "u1", },],);
  },);

  test("emitPluginEvent error isolation: throwing handler does not block later ones", async () => {
    const okSeen: string[] = [];
    liveHandlers.push({
      event: "chat.archived",
      handler: async () => { throw new Error("plugin boom",); },
    },);
    liveHandlers.push({
      event: "chat.archived",
      handler: async () => { okSeen.push("reached",); },
    },);

    const errors: unknown[] = [];
    const invoked = await emitPluginEvent(
      liveHandlers,
      "chat.archived",
      { chatId: "x", },
      { onError: (e: unknown,) => errors.push(e,), },
    );

    expect(invoked,).toBe(2,);
    expect(okSeen,).toEqual(["reached",],);
    expect(errors,).toHaveLength(1,);
  },);

  test("emitPluginEvent returns 0 when no handlers match the event", async () => {
    liveHandlers.push({
      event: "other.event",
      handler: async () => {},
    },);
    expect(await emitPluginEvent(liveHandlers, "chat.created", { chatId: "x", },),).toBe(0,);
  },);
});