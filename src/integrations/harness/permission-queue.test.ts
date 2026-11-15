// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * PermissionQueue tests: auto-allow vs park, FIFO listing, human decisions,
 * typed failures, and withdrawal on connection death.
 *
 * Resource contract (parallel-safe): in-memory only — a per-test sandbox
 * directory (mkdtemp) feeds the policy's realpath check and is removed in
 * afterEach; the connection registry is a per-test Map. No DB, no ports,
 * no shared globals, order-independent.
 */
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { mkdtempSync, rmSync, } from "node:fs";
import { createLogger, getChildLogger, type LogEntry, type Logger, setGlobalLogger, } from "../../logger";
import { PermissionAskGoneError, PermissionDecisionRefusedError, type PermissionOutcome, } from "./adapter-types";
import { PERMISSION_FAILURE, } from "./permission-failure";
import { advertisedPermissionOptions, wirePermissionOutcome, } from "./permission-outcome";
import type { PermissionRespondable, } from "./permission-queue";
import { PermissionQueue, } from "./permission-queue";

// The queue logs every auto-allow, park, and decision through the module
// child logger; a silent global logger exercises those real call sites
// (line coverage) without console noise or IO.
setGlobalLogger(createLogger({ console: false, dbEnabled: false, level: "error", },),);

/** The log entries the current test captured. */
const logEntries: LogEntry[] = [];

/** The child logger the queue logs through (flushed by the log assertions). */
let capture: Logger | null = null;

/**
 * Install a capturing global logger, so the queue's log entries are readable.
 * The queue logs through the memoized `harness-permission` child, so the
 * capture transport rides that child.
 */
function captureLogs(): void {
  const logger = createLogger({ console: false, dbEnabled: false, level: "info", },);
  setGlobalLogger(logger,);
  capture = getChildLogger("harness-permission",);
  capture?.addTransport({
    name: "capture",
    write: (entry,) => {
      logEntries.push(entry,);
      return Promise.resolve();
    },
    flush: () => Promise.resolve(),
  },);
}

/** Shared parent for per-test sandboxes (the repo's .tmp scratchpad). */
const TMP_ROOT = ".tmp/harness-permission-queue";

/** Sandboxes created by the current test; removed after each. */
const sandboxes: string[] = [];

/** Per-test connection registry: profile → the outcomes it was sent. */
interface Harness {
  queue: PermissionQueue;
  outcomes: Map<string, PermissionOutcome[]>;
  root: string;
}

/**
 * A harness with one live profile "p" whose connection records every
 * outcome and answers with the wire shape the decision maps onto;
 * `dropConnection` simulates the connection dying.
 * @param advertised - the options the connection's harness advertised
 */
function harness(advertised: { optionId: string; kind: string }[] = [],): Harness & { dropConnection: () => void } {
  const root = mkdtempSync(TMP_ROOT,);
  sandboxes.push(root,);
  const outcomes = new Map<string, PermissionOutcome[]>();
  const options = advertisedPermissionOptions({ options: advertised, },);
  let live = true;
  const connectionFor = (profile: string,): PermissionRespondable | undefined => {
    if (!live) { return undefined; }
    return {
      respondPermission: (outcome,) => {
        const log = outcomes.get(profile,) ?? [];
        log.push(outcome,);
        outcomes.set(profile, log,);
        // The connection answers with the wire shape; the queue relays it.
        return wirePermissionOutcome(outcome, options,);
      },
    };
  };

  return {
    queue: new PermissionQueue({ connection: connectionFor, },),
    outcomes,
    root,
    dropConnection: () => {
      live = false;
    },
  };
}

beforeEach(() => {
  logEntries.length = 0;
  captureLogs();
},);

afterEach(() => {
  logEntries.length = 0;
  setGlobalLogger(createLogger({ console: false, dbEnabled: false, level: "error", },),);
  while (sandboxes.length > 0) { rmSync(sandboxes.pop() ?? "", { recursive: true, force: true, },); }
},);

/** A write-shaped ask (kind edit); the sandbox root is only recorded. */
function editAsk(root: string,) {
  return {
    profile: "p",
    pending: { params: { sessionId: "s", kind: "edit", }, kind: "edit", },
    sandboxRoot: root,
  };
}

describe("PermissionQueue", () => {
  it("auto-allows a read-only in-sandbox ask without queueing it", async () => {
    const h = harness();
    const result = await h.queue.submit({
      profile: "p",
      pending: { params: { sessionId: "s", path: "notes.md", }, kind: "read", },
      sandboxRoot: h.root,
    },);

    expect(result.decision,).toBe("auto_allow",);
    expect(h.queue.pendingCount(),).toBe(0,);
    expect(h.outcomes.get("p",),).toEqual([{ outcome: "allow_once", },],);
  });

  it("parks a write ask with id/profile/tool/input/cwd/arrival", async () => {
    const h = harness();
    const result = await h.queue.submit(editAsk(h.root,),);

    if (result.decision !== "pending") { throw new Error("expected pending",); }
    const items = h.queue.listPending();
    expect(items,).toHaveLength(1,);
    expect(items[0]?.id,).toBe(result.id,);
    expect(items[0]?.profile,).toBe("p",);
    expect(items[0]?.tool,).toBe("edit",);
    expect(items[0]?.cwd,).toBe(h.root,);
    expect(items[0]?.arrival,).toBeGreaterThan(0,);
    expect(items[0]?.undeliverableReason,).toBeNull();
    expect(h.outcomes.get("p",),).toBeUndefined();
  });

  it("parks an unclassifiable ask instead of guessing", async () => {
    const h = harness();
    const result = await h.queue.submit({
      profile: "p",
      pending: { params: { sessionId: "s", }, kind: null, },
      sandboxRoot: h.root,
    },);

    expect(result.decision,).toBe("pending",);
  });

  it("lists pending asks FIFO by arrival", async () => {
    const h = harness();
    const first = await h.queue.submit(editAsk(h.root,),);
    const second = await h.queue.submit({ ...editAsk(h.root,), profile: "q", },);

    if (first.decision !== "pending" || second.decision !== "pending") { throw new Error("expected pending",); }
    expect(h.queue.listPending().map((e,) => e.id),).toEqual([first.id, second.id,],);
  });

  it("resolves two concurrent asks independently in any order", async () => {
    const h = harness();
    const first = await h.queue.submit(editAsk(h.root,),);
    const second = await h.queue.submit(editAsk(h.root,),);
    if (first.decision !== "pending" || second.decision !== "pending") { throw new Error("expected pending",); }

    expect(h.queue.resolve({ id: second.id, decision: "approve", },),).toEqual({
      ok: true,
      answer: { outcome: "cancelled", },
    },);

    expect(h.queue.resolve({ id: first.id, decision: "deny", },),).toEqual({
      ok: true,
      answer: { outcome: "cancelled", },
    },);

    expect(h.queue.pendingCount(),).toBe(0,);
    expect(h.outcomes.get("p",),).toEqual([{ outcome: "allow_once", }, { outcome: "reject_once", },],);
  });

  it("approve answers allow_once and deny answers reject_once", async () => {
    const h = harness();
    const a = await h.queue.submit(editAsk(h.root,),);
    const b = await h.queue.submit({ ...editAsk(h.root,), profile: "q", },);
    if (a.decision !== "pending" || b.decision !== "pending") { throw new Error("expected pending",); }

    expect(h.queue.resolve({ id: a.id, decision: "deny", },),).toEqual({
      ok: true,
      answer: { outcome: "cancelled", },
    },);

    expect(h.queue.resolve({ id: b.id, decision: "approve", },),).toEqual({
      ok: true,
      answer: { outcome: "cancelled", },
    },);

    expect(h.outcomes.get("p",),).toEqual([{ outcome: "reject_once", },],);
    expect(h.outcomes.get("q",),).toEqual([{ outcome: "allow_once", },],);
  });

  it("an unknown request id is a typed failure, not a throw", () => {
    const h = harness();
    expect(h.queue.resolve({ id: "ghost", decision: "approve", },),).toEqual({
      ok: false,
      code: "unknown_request",
      message: 'no pending permission request with id "ghost"',
    },);
  });

  it("a decided ask cannot be decided twice", async () => {
    const h = harness();
    const parked = await h.queue.submit(editAsk(h.root,),);
    if (parked.decision !== "pending") { throw new Error("expected pending",); }
    h.queue.resolve({ id: parked.id, decision: "deny", },);

    const twice = h.queue.resolve({ id: parked.id, decision: "approve", },);
    expect(!twice.ok && twice.code,).toBe("unknown_request",);
  });

  it("approving without a live connection fails typed and keeps the entry", async () => {
    const h = harness();
    const parked = await h.queue.submit(editAsk(h.root,),);
    if (parked.decision !== "pending") { throw new Error("expected pending",); }
    h.dropConnection();

    const result = h.queue.resolve({ id: parked.id, decision: "approve", },);
    if (result.ok) { throw new Error("expected a typed failure",); }
    expect(result.code,).toBe("no_connection",);
    expect(h.queue.pendingCount(),).toBe(1,);
  });

  it("denying without a live connection drops the dead ask", async () => {
    const h = harness();
    const parked = await h.queue.submit(editAsk(h.root,),);
    if (parked.decision !== "pending") { throw new Error("expected pending",); }
    h.dropConnection();

    const result = h.queue.resolve({ id: parked.id, decision: "deny", },);
    if (result.ok) { throw new Error("expected a typed failure",); }
    expect(result.code,).toBe("no_connection",);
    expect(h.queue.pendingCount(),).toBe(0,);
  });

  it("does not report a decision the harness refused as decided", async () => {
    const root = mkdtempSync(TMP_ROOT,);
    sandboxes.push(root,);
    const queue = new PermissionQueue({
      connection: () => ({
        respondPermission: () => {
          throw new PermissionDecisionRefusedError({ outcome: "cancelled", },);
        },
      }),
    },);

    const parked = await queue.submit(editAsk(root,),);
    if (parked.decision !== "pending") { throw new Error("expected pending",); }

    const result = queue.resolve({ id: parked.id, decision: "approve", },);
    if (result.ok) { throw new Error("expected a typed failure",); }
    // A refusal is not a vanished ask: it has its own code.
    expect(result.code,).toBe(PERMISSION_FAILURE.refused,);
    expect(result.message,).toContain("the harness refused the decision",);
    // The ask was answered on the wire, so the row goes with it.
    expect(queue.pendingCount(),).toBe(0,);
  });

  it("reports a denial the harness answered as delivered, with the wire shape", async () => {
    const h = harness();
    const parked = await h.queue.submit({
      profile: "p",
      pending: {
        params: {
          sessionId: "s",
          kind: "edit",
          options: [{ optionId: "allow", name: "Allow", kind: "allow_once", },],
        },
        kind: "edit",
      },
      sandboxRoot: h.root,
    },);

    if (parked.decision !== "pending") { throw new Error("expected pending",); }

    const result = h.queue.resolve({ id: parked.id, decision: "deny", },);

    // No advertised option can carry the denial, so the wire answer is the
    // protocol's cancellation - and the queue reports the denial as DELIVERED,
    // never as an approval.
    expect(result.ok,).toBe(true,);
    if (!result.ok) { throw new Error("expected the denial to be delivered",); }
    expect(result.answer,).toEqual({ outcome: "cancelled", },);
    expect(h.outcomes.get("p",),).toEqual([{ outcome: "reject_once", },],);
  });

  it("delivers a denial the harness cannot carry as the protocol's cancellation", async () => {
    const h = harness([{ optionId: "allow", kind: "allow_once", },],);
    const parked = await h.queue.submit({
      profile: "p",
      pending: {
        params: {
          sessionId: "s",
          kind: "edit",
          options: [{ optionId: "allow", name: "Allow", kind: "allow_once", },],
        },
        kind: "edit",
      },
      sandboxRoot: h.root,
    },);

    if (parked.decision !== "pending") { throw new Error("expected pending",); }

    const result = h.queue.resolve({ id: parked.id, decision: "deny", },);

    // Only allow-polarity options were advertised, so none can carry the
    // denial: the wire answer is the protocol's cancellation. The tool call is
    // refused and the decision IS delivered - never as an approval.
    expect(result.ok,).toBe(true,);
    if (!result.ok) { throw new Error("expected the denial to be delivered",); }
    expect(result.answer,).toEqual({ outcome: "cancelled", },);
    expect(h.outcomes.get("p",),).toEqual([{ outcome: "reject_once", },],);
  });

  it("reports the approval's wire answer when an advertised option carries it", async () => {
    const h = harness([{ optionId: "allow", kind: "allow_once", },],);
    const parked = await h.queue.submit({
      profile: "p",
      pending: {
        params: {
          sessionId: "s",
          kind: "edit",
          options: [{ optionId: "allow", name: "Allow", kind: "allow_once", },],
        },
        kind: "edit",
      },
      sandboxRoot: h.root,
    },);

    if (parked.decision !== "pending") { throw new Error("expected pending",); }

    const result = h.queue.resolve({ id: parked.id, decision: "approve", },);

    // The advertised allow option carries the approval, so the wire answer
    // names it - not the fallback the empty option list would produce.
    expect(result.ok,).toBe(true,);
    if (!result.ok) { throw new Error("expected the approval to be delivered",); }
    expect(result.answer,).toEqual({ outcome: "selected", optionId: "allow", },);
  });

  it("logs the wire answer next to the decision", async () => {
    const h = harness([{ optionId: "allow", kind: "allow_once", },],);
    const parked = await h.queue.submit({
      profile: "p",
      pending: {
        params: {
          sessionId: "s",
          kind: "edit",
          options: [{ optionId: "allow", name: "Allow", kind: "allow_once", },],
        },
        kind: "edit",
      },
      sandboxRoot: h.root,
    },);

    if (parked.decision !== "pending") { throw new Error("expected pending",); }

    h.queue.resolve({ id: parked.id, decision: "approve", },);
    await capture?.flush();

    // The operator reads the log: it names the decision AND the answer that
    // went on the wire, so a decision is never read as the other one.
    const entry = logEntries.find((item,) => item.message === "harness permission decided");
    expect(entry?.meta?.decision,).toBe("approve",);
    expect(entry?.meta?.answer,).toEqual({ outcome: "selected", optionId: "allow", },);
  });

  it("withdrawProfile drops the profile's asks and reports their ids", async () => {
    const h = harness();
    const parked = await h.queue.submit(editAsk(h.root,),);
    await h.queue.submit({ ...editAsk(h.root,), profile: "q", },);
    if (parked.decision !== "pending") { throw new Error("expected pending",); }

    expect(h.queue.withdrawProfile("p",),).toEqual([parked.id,],);
    expect(h.queue.pendingCount(),).toBe(1,);
    expect(h.queue.listPending()[0]?.profile,).toBe("q",);
  });

  it("a connection that rejects the decision fails typed and keeps the entry", async () => {
    const root = mkdtempSync(TMP_ROOT,);
    sandboxes.push(root,);
    const queue = new PermissionQueue({
      connection: () => ({
        respondPermission: () => {
          throw new Error("channel closed",);
        },
      }),
    },);

    const parked = await queue.submit(editAsk(root,),);
    if (parked.decision !== "pending") { throw new Error("expected pending",); }

    const result = queue.resolve({ id: parked.id, decision: "approve", },);
    if (result.ok) { throw new Error("expected a typed failure",); }
    expect(result.code,).toBe("not_delivered",);
    expect(result.message,).toBe('profile "p" did not accept the decision',);
    expect(queue.pendingCount(),).toBe(1,);

    // The row says WHY it is parked: a retry may still deliver the decision.
    expect(queue.listPending()[0]?.undeliverableReason,).toContain("could not be delivered",);
  });

  it("a decision against an ask the harness no longer holds says so and drops the row", async () => {
    const root = mkdtempSync(TMP_ROOT,);
    sandboxes.push(root,);
    const queue = new PermissionQueue({
      connection: () => ({
        respondPermission: () => {
          throw new PermissionAskGoneError();
        },
      }),
    },);

    const parked = await queue.submit(editAsk(root,),);
    if (parked.decision !== "pending") { throw new Error("expected pending",); }

    const result = queue.resolve({ id: parked.id, decision: "approve", },);
    if (result.ok) { throw new Error("expected a typed failure",); }
    expect(result.code,).toBe("ask_gone",);

    // Nothing is left to decide: the row goes with the ask.
    expect(queue.pendingCount(),).toBe(0,);
  });

  it("an auto-allow whose delivery fails transiently parks the ask with the reason", async () => {
    const root = mkdtempSync(TMP_ROOT,);
    sandboxes.push(root,);
    const queue = new PermissionQueue({
      connection: () => ({
        respondPermission: () => {
          throw new Error("channel closed",);
        },
      }),
    },);

    // The runtime submits fire-and-forget: an undeliverable decision must be
    // a parked ask, never a rejection that escapes the queue.
    const result = await queue.submit({
      profile: "p",
      pending: { params: { sessionId: "s", path: "notes.md", }, kind: "read", },
      sandboxRoot: root,
    },);

    expect(result.decision,).toBe("pending",);
    expect(queue.pendingCount(),).toBe(1,);
    expect(queue.listPending()[0]?.undeliverableReason,).toContain("could not be delivered",);
  });

  it("an auto-allow whose ask is gone drops the ask instead of parking a dead row", async () => {
    const root = mkdtempSync(TMP_ROOT,);
    sandboxes.push(root,);
    const queue = new PermissionQueue({
      connection: () => ({
        respondPermission: () => {
          throw new PermissionAskGoneError();
        },
      }),
    },);

    const result = await queue.submit({
      profile: "p",
      pending: { params: { sessionId: "s", path: "notes.md", }, kind: "read", },
      sandboxRoot: root,
    },);

    // The harness no longer holds the ask: there is nothing left to decide,
    // so no row is parked and none can ever clear.
    expect(result.decision,).toBe("withdrawn",);
    expect(queue.pendingCount(),).toBe(0,);
  });

  it("a withdrawal that lands while the ask is classified strands no row", async () => {
    const h = harness();

    // The withdrawal lands while the classification is still in flight: the
    // ask is answered by the cancellation, so parking it would strand a row
    // no decision can ever clear.
    const submitted = h.queue.submit(editAsk(h.root,),);
    h.queue.withdrawProfile("p",);

    const result = await submitted;
    expect(result.decision,).toBe("withdrawn",);
    expect(h.queue.pendingCount(),).toBe(0,);
  });

  it("idle() settles once concurrent submits finish", async () => {
    const h = harness();
    const inFlight = [h.queue.submit(editAsk(h.root,),), h.queue.submit(editAsk(h.root,),),];
    await h.queue.idle();

    for (const settled of await Promise.all(inFlight,)) {
      expect(settled.decision,).toBe("pending",);
    }

    await h.queue.idle(); // idempotent when nothing is in flight
  });

  it("an auto-allowable ask through a missing connection parks, never auto-allows", async () => {
    const h = harness();
    h.dropConnection();
    const result = await h.queue.submit({
      profile: "p",
      pending: { params: { sessionId: "s", path: "notes.md", }, kind: "read", },
      sandboxRoot: h.root,
    },);

    expect(result.decision,).toBe("pending",);
  });
});
