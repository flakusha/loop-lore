// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 280

/**
 * Offline send outbox — a localStorage FIFO of failed chat sends
 * (TASK-pwa-cached-shell-plus-send-queue slices 2-3).
 *
 * Entries carry the exact POST payload (the pre-serialized body string, i.e.
 * already-encrypted bytes when the chat is encrypted) plus the idempotency
 * key the server's POST /chats/:id/messages intake already accepts
 * (`body.idempotencyKey` coalesced by the messages.idempotencyKey unique
 * index, migration 045; the `Idempotency-Key` header rides feFetch). A
 * drained replay is therefore byte-identical to the original send: a partial
 * success (stored row, lost response) replays into the intake's
 * idempotency short-circuit and returns the original id — never a duplicate.
 *
 * Drain policy:
 *   - 2xx            → remove the entry, keep draining.
 *   - 4xx            → poison: surface + drop ONLY that entry, keep draining
 *                      (order for the rest is preserved).
 *   - 5xx            → count an attempt, pause the round; at the ceiling
 *                      (OUTBOX_MAX_ATTEMPTS) surface + drop the entry.
 *   - offline-class  → keep the entry (never counts toward poison — the
 *                      failure is the network's, not the entry's), pause the
 *                      round. Entries can queue indefinitely while offline.
 *
 * The round is single-flighted: concurrent triggers share one pass, and an
 * entry enqueued mid-round is picked up by the next trigger, never clobbered.
 * IndexedDB upgrade path: noted in the ticket, deliberately not built.
 */

import { jsonBody, jsonParseOr, } from "../alpine/json";
import { browserRandomUUIDv7, } from "../browser";

/** Minimal storage surface so tests can inject an in-memory fake. */
export interface OutboxStorage {
  getItem(key: string,): string | null;
  setItem(key: string, value: string,): void;
  removeItem(key: string,): void;
}

/** One queued send; `body` is the exact serialized POST body. */
export interface OutboxEntry {
  id: string;
  chatId: string;
  idempotencyKey: string;
  body: string;
  enqueuedAt: number;
  /** Failed server-side drain attempts; offline pauses never count. */
  attempts: number;
}

/** New-entry input; `id` / `enqueuedAt` / `attempts` are store-assigned. */
export interface OutboxEnqueueInput {
  chatId: string;
  idempotencyKey: string;
  body: string;
}

/** Response subset a drain send reports (or it throws — offline classification applies). */
export interface OutboxSendResult {
  ok: boolean;
  status: number;
}

/** Sends one queued entry through the live request path. */
export type OutboxSend = (entry: OutboxEntry,) => Promise<OutboxSendResult>;

/** Why a dropped entry left the queue. */
export type OutboxDropReason = "poison" | "max-attempts";

/** A dropped entry plus its cause (HTTP status when the server answered). */
export interface OutboxDrop {
  entry: OutboxEntry;
  reason: OutboxDropReason;
  status?: number;
}

/** Result of one drain round. */
export interface OutboxDrainReport {
  delivered: OutboxEntry[];
  dropped: OutboxDrop[];
  /** Entries still queued after the round (paused offline or on a 5xx). */
  pending: number;
}

/** Options for {@link createOutbox}. */
export interface OutboxOptions {
  /** Backing storage; `null` (or undefined APIs) makes the store inert. */
  storage: OutboxStorage | null;
  /** Clock seam for tests; defaults to `Date.now`. */
  now?: () => number;
}

/** Store surface returned by {@link createOutbox}. */
export interface OutboxStore {
  /** Append one send to the FIFO; returns the stored entry. */
  enqueue(input: OutboxEnqueueInput,): OutboxEntry;
  /** Current FIFO, oldest first. A corrupt payload reads as empty. */
  entries(): OutboxEntry[];
  /** Number of queued entries. */
  depth(): number;
  /** `true` while a drain round is in flight. */
  draining(): boolean;
  /**
   * Replay the FIFO in order through `send`. Single-flighted: concurrent
   * calls share the running round instead of double-sending.
   * @param send - transport seam; defaults live in the connection wiring
   * @returns the round report (delivered / dropped / still-pending counts)
   */
  drain(send: OutboxSend,): Promise<OutboxDrainReport>;
}

/** localStorage key holding the FIFO (ticket-specified). */
export const OUTBOX_STORAGE_KEY = "ll-outbox-v1";

/** Server-side failure ceiling before an entry is surfaced + dropped. */
export const OUTBOX_MAX_ATTEMPTS = 3;

/** SW → page message type nudging a drain after observed connectivity. */
export const OUTBOX_DRAIN_MESSAGE = "ll-drain-outbox";

/**
 * Classify a thrown send error as offline-class (network down / timeout /
 * abort — the request never reached HTTP). fe-fetch attaches `status` to
 * every error that carries an HTTP response, so a missing status means the
 * transport failed; the bare `Unauthorized` throw (401) is explicitly not
 * offline — the server answered.
 * @param error - thrown value from the send attempt
 * @returns `true` when the entry should stay queued rather than count as poison
 */
export function isOfflineClassError(error: unknown,): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) { return true; }
  if (error instanceof Error && error.message === "Unauthorized") { return false; }
  if (error instanceof TypeError) { return true; }
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status !== "number";
}

/** Narrow a parsed JSON row back to {@link OutboxEntry}; corrupt rows are skipped. */
function isOutboxEntry(value: unknown,): value is OutboxEntry {
  if (value === null || typeof value !== "object") { return false; }
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" &&
    typeof row.chatId === "string" &&
    typeof row.idempotencyKey === "string" &&
    typeof row.body === "string" &&
    typeof row.enqueuedAt === "number" &&
    typeof row.attempts === "number";
}

/**
 * Build the outbox store over injected storage.
 * @param options - storage seam (browser localStorage in production) + clock
 * @returns the FIFO store; every method is a no-op without storage
 */
export function createOutbox(options: OutboxOptions,): OutboxStore {
  const { storage, now = Date.now, } = options;

  const read = (): OutboxEntry[] => {
    if (!storage) { return []; }
    const raw = storage.getItem(OUTBOX_STORAGE_KEY,);
    if (!raw) { return []; }
    // Corrupt payload reads as empty — the queue heals on next write.
    const parsed = jsonParseOr<unknown[]>(raw, [],);
    return Array.isArray(parsed,) ? parsed.filter(isOutboxEntry,) : [];
  };

  // Re-read before every write so an entry enqueued during a drain round is
  // never clobbered by the round's snapshot.
  const write = (entries: OutboxEntry[],): void => {
    if (!storage) { return; }
    try {
      storage.setItem(OUTBOX_STORAGE_KEY, jsonBody(entries,),);
    } catch {
      // Quota errors are swallowed (draft-store precedent): a full queue
      // degrades to in-memory-only for this round, it never crashes a send.
    }
  };

  const removeById = (id: string,): void => {
    write(read().filter((entry,) => entry.id !== id),);
  };

  const patchAttempts = (id: string, attempts: number,): void => {
    write(read().map((entry,) => entry.id === id ? { ...entry, attempts, } : entry),);
  };

  let drainInFlight: Promise<OutboxDrainReport> | null = null;

  const runRound = async (send: OutboxSend,): Promise<OutboxDrainReport> => {
    const report: OutboxDrainReport = { delivered: [], dropped: [], pending: 0, };
    for (const entry of read()) {
      let result: OutboxSendResult;
      try {
        result = await send(entry,);
      } catch (error: unknown) {
        if (isOfflineClassError(error,)) {
          break; // the network's fault — never counts toward poison
        }

        // Non-offline transport failure (payload bug, unauthorized, …):
        // count the attempt; at the ceiling surface + drop, else pause.
        const attempts = entry.attempts + 1;
        if (attempts >= OUTBOX_MAX_ATTEMPTS) {
          const dropped = { ...entry, attempts, };
          removeById(entry.id,);
          report.dropped.push({ entry: dropped, reason: "max-attempts", },);
          continue;
        }

        patchAttempts(entry.id, attempts,);
        break;
      }

      if (result.ok && result.status >= 200 && result.status < 300) {
        removeById(entry.id,);
        report.delivered.push(entry,);
        continue;
      }

      if (result.status >= 400 && result.status < 500) {
        // Poison: the server rejected THIS message — drop only it, keep order.
        removeById(entry.id,);
        report.dropped.push({ entry, reason: "poison", status: result.status, },);
        continue;
      }

      const attempts = entry.attempts + 1;
      if (attempts >= OUTBOX_MAX_ATTEMPTS) {
        const dropped = { ...entry, attempts, };
        removeById(entry.id,);
        report.dropped.push({ entry: dropped, reason: "max-attempts", status: result.status, },);
        continue;
      }

      patchAttempts(entry.id, attempts,);
      break; // server trouble: pause the round, entry stays queued
    }

    report.pending = read().length;
    return report;
  };

  return {
    enqueue(input,) {
      const entry: OutboxEntry = {
        id: browserRandomUUIDv7(),
        chatId: input.chatId,
        idempotencyKey: input.idempotencyKey,
        body: input.body,
        enqueuedAt: now(),
        attempts: 0,
      };

      write([...read(), entry,],);
      return entry;
    },
    entries: read,
    depth: () => read().length,
    draining: () => drainInFlight !== null,
    drain(send,) {
      if (drainInFlight) { return drainInFlight; }
      const round = runRound(send,).finally(() => {
        drainInFlight = null;
      },);

      drainInFlight = round;
      return round;
    },
  };
}
