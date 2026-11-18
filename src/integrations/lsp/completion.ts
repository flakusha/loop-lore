// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Completion dispatch: the per-connection single-flight, debounced,
 * read-only `dispatchHarnessTurn` call plus the lazy chat/actor binding the
 * audited turn persists into. The binding object is connection-owned and
 * mutated in place (`initialize` fills the identity, `ensureBinding` fills
 * the chat/actor), so the handler keeps the lifecycle and this module owns
 * only the dispatch mechanics.
 */

import type { Kysely, } from "kysely";
import { createChat, } from "../../chat/service/crud/create";
import type { DB, } from "../../db/schema";
import {
  dispatchHarnessTurn,
  type DispatchHarnessTurnOptions,
  type DispatchHarnessTurnOutcome,
} from "../harness/dispatch";
import type { HarnessRuntime, } from "../harness/runtime";
import type { OpenDoc, } from "./documents";
import { buildCompletionPrompt, } from "./prompt";

/** Trailing debounce before a completion dispatches (ms); injectable for tests. */
const DEFAULT_DEBOUNCE_MS = 150;

/** Upper bound one completion waits for the harnessed turn (ms); injectable for tests. */
const DEFAULT_COMPLETION_TIMEOUT_MS = 30_000;

/**
 * Rejection when the harnessed turn outlives the completion budget — e.g. the
 * agent disobeyed the read-only directive and its write/exec ask parked with
 * no timeout. The handler answers an empty list; single-flight is released.
 */
export class CompletionTimeoutError extends Error {
  constructor() {
    super("completion timed out",);
    this.name = "CompletionTimeoutError";
  }
}

/** What one completion runs against: the tracked doc, its uri, and the cursor. */
export interface CompletionTarget {
  doc: OpenDoc;
  uri: string;
  line: number;
  character: number;
}

/** The audited identity one connection dispatches under; mutated in place. */
export interface CompletionBinding {
  /** The database turns persist into. */
  database: Kysely<DB>;
  /** The composed harness runtime. */
  runtime: HarnessRuntime;
  /** Dispatch seam; default the real `dispatchHarnessTurn` (read-only prompt). */
  dispatchTurn?: (options: DispatchHarnessTurnOptions,) => Promise<DispatchHarnessTurnOutcome>;
  /** Completion debounce window; default 150ms, 0 in tests. */
  debounceMs?: number;
  /** Completion budget; default 30000ms, small in tests. */
  timeoutMs?: number;
  /** Issuing admin's role; set by `initialize`, null before. */
  role: string | null;
  /** Issuing admin's user id; set by `initialize`, null before. */
  userId: string | null;
  /** Harness profile to dispatch on. */
  profile: string;
  /** Chat completions audit into; filled lazily per connection. */
  chatId: string;
  /** Actor completions attribute to; filled lazily per connection. */
  actorId: string;
}

/** The per-connection completion service: binding ensure + debounced dispatch. */
export interface CompletionDispatcher {
  /** Seat the actor row and chat for the authenticated user (idempotent). */
  ensureBinding: (authenticatedUserId: string,) => Promise<void>;
  /** Dispatch one completion with debounce + single-flight; rejects on failure. */
  requestCompletion: (target: CompletionTarget,) => Promise<string>;
}

/**
 * Build the per-connection completion dispatcher over the shared binding.
 * @param binding - connection-owned identity; `initialize` fills it first
 * @returns the binding ensure + debounced dispatcher for one connection
 */
export function createCompletionDispatcher(binding: CompletionBinding,): CompletionDispatcher {
  const dispatchTurn = binding.dispatchTurn ?? dispatchHarnessTurn;
  const debounceMs = binding.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const timeoutMs = binding.timeoutMs ?? DEFAULT_COMPLETION_TIMEOUT_MS;
  let timer: NodeJS.Timeout | undefined;
  let pendingResolve: ((value: string,) => void) | null = null;
  let inFlight: Promise<string> | null = null;

  const dispatchCompletion = async (target: CompletionTarget,): Promise<string> => {
    const prompt = buildCompletionPrompt({
      uri: target.uri,
      languageId: target.doc.languageId,
      text: target.doc.text,
      line: target.line,
      character: target.character,
    },);

    const outcome = await new Promise<DispatchHarnessTurnOutcome>((resolve, reject,) => {
      // Fail-closed: a parked disobedient turn never settles, so cap the wait.
      // On expiry the race rejects, `runExclusive` releases single-flight, and
      // the handler answers an empty list — the parked turn stays parked for
      // the human, it just stops wedging this connection.
      const timer = setTimeout(() => reject(new CompletionTimeoutError(),), timeoutMs,);
      void dispatchTurn({
        runtime: binding.runtime,
        role: binding.role,
        userId: binding.userId,
        profile: binding.profile,
        prompt,
        database: binding.database,
        chatId: binding.chatId,
        actorId: binding.actorId,
      },).then(resolve, reject,).finally(() => clearTimeout(timer,));
    },);

    return outcome.turn.result.text.trim();
  };

  const runExclusive = async (target: CompletionTarget,): Promise<string> => {
    // Single-flight, sequential (never concurrent): a completion that fires
    // while one is in flight waits for it, then dispatches fresh — no stale
    // text for a moved cursor, no overlapping turns on one connection.
    if (inFlight !== null) {
      try {
        await inFlight;
      } catch { /* the waiter reports its own error */ }
    }

    const run = dispatchCompletion(target,);
    inFlight = run;
    try {
      return await run;
    } finally {
      if (inFlight === run) { inFlight = null; }
    }
  };

  const requestCompletion = (target: CompletionTarget,): Promise<string> => {
    // A superseded debounce window must settle: clearTimeout drops the only
    // callback that would ever resolve its promise, so settle it empty first.
    if (pendingResolve !== null) {
      pendingResolve("",);
      pendingResolve = null;
    }

    clearTimeout(timer,);
    const { promise, resolve, reject, } = Promise.withResolvers<string>();
    pendingResolve = resolve;
    timer = setTimeout(() => {
      timer = undefined;
      pendingResolve = null;
      void runExclusive(target,).then(resolve, reject,);
    }, debounceMs,);

    return promise;
  };

  const ensureBinding = async (authenticatedUserId: string,): Promise<void> => {
    // messages.actor_id and chat_participants.actor_id both FK to actors.id,
    // and createChat seats createdBy as the owner participant — so the user
    // needs an actor row under their own id before the chat exists.
    const existing = await binding.database
      .selectFrom("actors",)
      .select("id",)
      .where("id", "=", authenticatedUserId,)
      .executeTakeFirst();

    if (!existing) {
      await binding.database
        .insertInto("actors",)
        .values({ id: authenticatedUserId, display_name: "Editor LSP", actor_type: "user", },)
        .execute();
    }

    if (binding.chatId === "") {
      binding.chatId = await createChat(binding.database, { name: "Editor LSP", createdBy: authenticatedUserId, },);
    }

    if (binding.actorId === "") { binding.actorId = authenticatedUserId; }
  };

  return { ensureBinding, requestCompletion, };
}
