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
import { afterEach, describe, expect, it, } from "bun:test";
import { mkdtempSync, rmSync, } from "node:fs";
import type { PermissionOutcome, } from "./adapter-types";
import type { PermissionRespondable, } from "./permission-queue";
import { PermissionQueue, } from "./permission-queue";

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
 * outcome; `dropConnection` simulates the connection dying.
 */
function harness(): Harness & { dropConnection: () => void } {
  const root = mkdtempSync(TMP_ROOT,);
  sandboxes.push(root,);
  const outcomes = new Map<string, PermissionOutcome[]>();
  let live = true;
  const connectionFor = (profile: string,): PermissionRespondable | undefined => {
    if (!live) { return undefined; }
    return {
      respondPermission: (outcome,) => {
        const log = outcomes.get(profile,) ?? [];
        log.push(outcome,);
        outcomes.set(profile, log,);
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

afterEach(() => {
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

    expect(h.queue.resolve({ id: second.id, decision: "approve", },),).toEqual({ ok: true, },);
    expect(h.queue.resolve({ id: first.id, decision: "deny", },),).toEqual({ ok: true, },);
    expect(h.queue.pendingCount(),).toBe(0,);
    expect(h.outcomes.get("p",),).toEqual([{ outcome: "allow_once", }, { outcome: "reject_once", },],);
  });

  it("approve answers allow_once and deny answers reject_once", async () => {
    const h = harness();
    const a = await h.queue.submit(editAsk(h.root,),);
    const b = await h.queue.submit({ ...editAsk(h.root,), profile: "q", },);
    if (a.decision !== "pending" || b.decision !== "pending") { throw new Error("expected pending",); }

    expect(h.queue.resolve({ id: a.id, decision: "deny", },),).toEqual({ ok: true, },);
    expect(h.queue.resolve({ id: b.id, decision: "approve", },),).toEqual({ ok: true, },);
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

  it("withdrawProfile drops the profile's asks and reports their ids", async () => {
    const h = harness();
    const parked = await h.queue.submit(editAsk(h.root,),);
    await h.queue.submit({ ...editAsk(h.root,), profile: "q", },);
    if (parked.decision !== "pending") { throw new Error("expected pending",); }

    expect(h.queue.withdrawProfile("p",),).toEqual([parked.id,],);
    expect(h.queue.pendingCount(),).toBe(1,);
    expect(h.queue.listPending()[0]?.profile,).toBe("q",);
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
