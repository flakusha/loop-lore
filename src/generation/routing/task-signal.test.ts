// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Task-signal mapping tests: the routing class of a dispatch and the exec
 * log's task-type vocabulary are different, and the mapping between them is
 * what the exec log reads back.
 */
import { describe, expect, it, } from "bun:test";
import { AUTO_GEN, BACKGROUND, INTERACTIVE_TURN, toHarnessTaskType, toTaskSignal, } from "./task-signal";

describe("toHarnessTaskType", () => {
  it("maps the chat turn to chat", () => {
    expect(toHarnessTaskType("interactive-turn",),).toBe("chat",);
  });

  it("maps the auto generation to auto-gen", () => {
    expect(toHarnessTaskType("auto-gen",),).toBe("auto-gen",);
  });

  it("maps an outbound ACP dispatch to its own bucket", () => {
    expect(toHarnessTaskType("harness",),).toBe("harness",);
  });

  it("maps the background transport to memory", () => {
    expect(toHarnessTaskType("background",),).toBe("memory",);
  });

  it("rolls the AUX family up into aux", () => {
    expect(toHarnessTaskType("transition",),).toBe("aux",);
  });
});

describe("toTaskSignal", () => {
  it("classifies an AUX job as its own task class", () => {
    expect(toTaskSignal("transition",),).toEqual({ taskType: "transition", },);
  });

  it("keeps the named signals frozen", () => {
    expect(INTERACTIVE_TURN.taskType,).toBe("interactive-turn",);
    expect(AUTO_GEN.taskType,).toBe("auto-gen",);
    expect(BACKGROUND.taskType,).toBe("background",);
  });
});
