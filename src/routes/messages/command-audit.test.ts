// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Direct unit tests for the invocation audit emitter: one structured event,
 * deterministic output hash over the canonical response triple, hash change
 * when the output changes, and never-throw without a logger.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { CommandResult, } from "../../assistant/commands/registry";
import { createLogger, getLogger, type Logger, setGlobalLogger, } from "../../logger";
import { auditCommandInvocation, } from "./command-audit";

interface AuditEntry {
  level: string;
  message: string;
  meta?: Record<string, unknown>;
}

const entries: AuditEntry[] = [];
let priorLogger: Logger | undefined;

/** Capture-only logger implementing the full Logger interface (child() must
 * return a capturing logger — the emitter logs through a module child). */
class AuditCaptureLogger implements Logger {
  trace(message: string, meta?: Record<string, unknown>,): void {
    entries.push({ level: "trace", message, meta, },);
  }
  debug(message: string, meta?: Record<string, unknown>,): void {
    entries.push({ level: "debug", message, meta, },);
  }
  info(message: string, meta?: Record<string, unknown>,): void {
    entries.push({ level: "info", message, meta, },);
  }
  warn(message: string, meta?: Record<string, unknown>,): void {
    entries.push({ level: "warn", message, meta, },);
  }
  error(message: string, error?: Error, meta?: Record<string, unknown>,): void {
    entries.push({ level: "error", message, meta: { ...meta, error: error?.message, }, },);
  }
  fatal(message: string, error?: Error, meta?: Record<string, unknown>,): void {
    entries.push({ level: "fatal", message, meta: { ...meta, error: error?.message, }, },);
  }
  child(): Logger {
    return this;
  }
  addTransport(): void {}
  setBindings(): void {}
  setLevel(): void {}
  flush(): Promise<void> {
    return Promise.resolve();
  }
}

function result(partial: Partial<CommandResult>,): CommandResult {
  return { handled: true, ...partial, };
}

beforeEach(() => {
  entries.length = 0;
  // Fresh file processes start without a logger; seed an error-level root so
  // the capture logger always has a real prior to restore.
  try {
    createLogger({ level: "error", },);
  } catch {
    // Already initialized.
  }

  priorLogger = getLogger();
  setGlobalLogger(new AuditCaptureLogger(),);
},);

afterEach(() => {
  if (priorLogger) { setGlobalLogger(priorLogger,); }
},);

describe("auditCommandInvocation", () => {
  test("emits one event with command, user, args, and a 64-hex hash", () => {
    auditCommandInvocation({
      args: ["char-1", "--to", "w-9",],
      command: "adapt",
      result: result({ systemMessage: "preview", },),
      userId: "u-1",
    },);

    expect(entries,).toHaveLength(1,);
    const meta = entries[0]!.meta!;
    expect(meta.event,).toBe("assistant_command_invoked",);
    expect(meta.command,).toBe("adapt",);
    expect(meta.userId,).toBe("u-1",);
    expect(meta.args,).toEqual(["char-1", "--to", "w-9",],);
    expect(meta.outputHash,).toMatch(/^[0-9a-f]{64}$/,);
  });

  test("identical inputs hash identically — different outputs hash differently", () => {
    const invocation = { args: [], command: "narrate", userId: "u-2", };
    auditCommandInvocation({ ...invocation, result: result({ systemMessage: "same", },), },);
    auditCommandInvocation({ ...invocation, result: result({ systemMessage: "same", },), },);
    auditCommandInvocation({ ...invocation, result: result({ systemMessage: "changed", },), },);
    auditCommandInvocation({ ...invocation, result: result({ systemMessage: "same", action: "x", },), },);

    const [first, same, changed, withAction,] = entries.map((e,) => e.meta!.outputHash);
    expect(same,).toBe(first,);
    expect(changed,).not.toBe(first,);
    expect(withAction,).not.toBe(first,);
  });

  test("absent action/actionPayload hash as nulls", () => {
    auditCommandInvocation({ args: [], command: "help", result: result({},), userId: "u-3", },);
    auditCommandInvocation({
      args: [],
      command: "help",
      result: result({ action: undefined, actionPayload: undefined, },),
      userId: "u-3",
    },);

    expect(entries[0]!.meta!.outputHash,).toBe(entries[1]!.meta!.outputHash,);
  });

  test("never throws when no logger is initialized", () => {
    setGlobalLogger(undefined as unknown as Logger,);
    expect(() =>
      auditCommandInvocation({ args: [], command: "x", result: result({ systemMessage: "y", },), userId: "u-4", },)
    ).not.toThrow();

    expect(entries,).toHaveLength(0,);
  });
});
