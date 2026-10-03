// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Write-time enforcement of the state-machine + composite invariants that
 * already exist in the enum modules (TASK-019).
 *
 * The validators were defined and unit-tested but never consulted at runtime,
 * so write paths could still persist a state the machine forbids. This module
 * is the single dispatch point: `assertValidWrite(table, row)` looks the table
 * up in a small map and runs the matching `CompositeValidator`.
 *
 * Scope - deliberately narrow:
 * - Only invariants decidable from a single row are enforced. The branch
 *   display invariant (`chat_branches.is_active` x `chats.active_branch_id`)
 *   spans two tables and stays enforced by its own transaction.
 * - `assertValidWrite` runs at the service write site, so a caller must pass
 *   the *composite* state it is about to persist. A partial write must merge
 *   the persisted counterpart axis into `row`; a missing axis column is a
 *   programming error and throws rather than silently passing.
 * - `messages.status` carries a legacy DB default of `"visible"` (001_init.ts:1864)
 *   that predates `MessageStatus` and is not a member of it. Inserts that omit
 *   `status`, and rows written before the enum landed, persist that literal, and
 *   `updateMessageVisibility` merges the persisted status back in on them — so
 *   exactly that one value is exempted from the PAIR check. The exemption is not
 *   a hole in the guard: both axes are still validated against their own enum
 *   first, so a typo in `visibility` cannot ride in behind it, and any other
 *   unrecognised status is rejected rather than passed through unchecked.
 */
import { shareAlikeDerivatives, } from "../../characters/license-enforcement";
import { safeJsonStringify, } from "../../utils";
import {
  messagesStatusVisibility,
  MessageStatus,
  MessageVisibility,
  shadowNotesStatusVisibility,
} from "../enums";
import type { TableName, } from "../schema-manifest";

/** Structural minimum of `CompositeValidator` - only the allowed-pairs set. */
interface PairSet {
  readonly allowed: ReadonlySet<string>;
}

/** A per-table row check. Throws on an illegal combination. */
type RowGuard = (row: Record<string, unknown>,) => void;

/** Tables carrying a write-time invariant. Adding a table = adding a key. */
type GuardedTable =
  | "messages"
  | "shadow_notes"
  | "character_licensing";

/**
 * Read a text axis column.
 * @throws {Error} when the column is absent or not a string.
 */
function readAxis(row: Record<string, unknown>, table: string, column: string,): string {
  const value = row[column];
  if (typeof value !== "string") {
    throw new Error(
      `assertValidWrite: ${table}.${column} must be a string on the write, got ${typeof value}`,
    );
  }
  return value;
}

/**
 * Read a 0/1 integer axis column.
 * @throws {Error} when the column is absent or not 0/1.
 */
function readFlag(row: Record<string, unknown>, table: string, column: string,): 0 | 1 {
  const value = row[column];
  if (value !== 0 && value !== 1) {
    // safeJsonStringify, not bare JSON.stringify: the latter is banned repo-wide.
    const quoted = safeJsonStringify(value,);
    throw new Error(
      `assertValidWrite: ${table}.${column} must be 0 or 1 on the write, got ${quoted.ok ? quoted.value : value}`,
    );
  }
  return value;
}

/** `001_init.ts:1864` — NOT NULL DEFAULT 'visible'; a MessageVisibility value, never a MessageStatus. */
const LEGACY_MESSAGES_STATUS = "visible";

const KNOWN_STATUSES: ReadonlySet<string> = new Set(Object.values(MessageStatus,),);
const KNOWN_VISIBILITIES: ReadonlySet<string> = new Set(Object.values(MessageVisibility,),);

/**
 * Assert a column value is a member of its own enum, tolerating one named
 * legacy default that predates the enum.
 * @throws {Error} when the value is neither an enum member nor `legacy`.
 */
function assertKnownAxis(
  column: string,
  enumName: string,
  value: string,
  known: ReadonlySet<string>,
  legacy: string | null = null,
): void {
  if (value === legacy) { return; }
  if (!known.has(value,)) {
    // safeJsonStringify, not bare JSON.stringify: the latter is banned repo-wide.
    const quoted = safeJsonStringify(value,);
    throw new Error(
      `assertValidWrite: ${column} ${quoted.ok ? quoted.value : value} is not a ${enumName}`,
    );
  }
}

/**
 * Assert a two-axis pair against the validator's allowed set.
 * @throws {Error} when the pair is not in the allowed set.
 */
function assertPair(
  table: string,
  validator: PairSet,
  axisA: string,
  axisB: string,
  label: string,
): void {
  if (!validator.allowed.has(`${axisA}:${axisB}`,)) {
    throw new Error(
      `assertValidWrite: ${table} ${label} ${axisA}:${axisB} is not a legal state pair`,
    );
  }
}

/** `messages.status` x `messages.visibility`. */
const guardMessages: RowGuard = (row,) => {
  const status = readAxis(row, "messages", "status",);
  const visibility = readAxis(row, "messages", "visibility",);
  assertKnownAxis("messages.status", "MessageStatus", status, KNOWN_STATUSES, LEGACY_MESSAGES_STATUS,);
  assertKnownAxis("messages.visibility", "MessageVisibility", visibility, KNOWN_VISIBILITIES,);
  // The legacy default is not a MessageStatus, so it has no place in the
  // status machine and therefore no pair to check. The exemption covers the
  // PAIR only — each axis is validated against its own enum above, so a typo
  // in `visibility` cannot ride in behind it.
  if (status === LEGACY_MESSAGES_STATUS) { return; }
  assertPair("messages", messagesStatusVisibility, status, visibility, "status x visibility",);
};

/** `shadow_notes.status` x `shadow_notes.visibility`. */
const guardShadowNotes: RowGuard = (row,) => {
  assertPair(
    "shadow_notes",
    shadowNotesStatusVisibility,
    readAxis(row, "shadow_notes", "status",),
    readAxis(row, "shadow_notes", "visibility",),
    "status x visibility",
  );
};

/** `character_licensing.allow_derivatives` x `character_licensing.share_alike`. */
const guardCharacterLicensing: RowGuard = (row,) => {
  const derivatives = readFlag(row, "character_licensing", "allow_derivatives",) === 1
    ? "allowed"
    : "forbidden";
  const shareAlike = readFlag(row, "character_licensing", "share_alike",) === 1 ? "yes" : "no";
  assertPair(
    "character_licensing",
    shareAlikeDerivatives,
    derivatives,
    shareAlike,
    "allow_derivatives x share_alike",
  );
};

/**
 * Table -> row check. Typing the record against `GuardedTable` makes a missing
 * key a compile error, so a new guarded table cannot be added without a guard.
 *
 * SCOPE — `assertValidWrite` is a service-write-site helper, NOT table-wide
 * enforcement. It only checks a row at a call site that remembers to invoke it.
 * Guarded pairs, and the only instrumented call sites:
 * - `messages.status` x `messages.visibility`
 *   write.ts:153, visibility.ts:46
 * - `shadow_notes.status` x `shadow_notes.visibility`
 *   shadow.ts:174, shadow.ts:202, annotations.ts:134
 * - `character_licensing.allow_derivatives` x `.share_alike`
 *   character-licensing.ts:154, character-licensing.ts:169,
 *   importers/character-systems/licensing.ts:43, :57
 *
 * Writes to these same columns that do NOT call the guard, and so are unchecked
 * (re-derive with a grep for `updateTable("messages")` / `insertInto("messages")`
 * over src/, keeping the sites whose .set()/.values() names a guarded column):
 * routes/messages/update.ts:77, :198 (visibility), :220 (status),
 * routes/messages/archiving.ts:56, :86, auto-gen/context-pruning.ts:82,
 * chat/service/message-history.ts:76, chat/service/carry-history.ts:60,
 * chat/service/split-utils.ts:147, chat/service/transitions.ts:189,
 * chat/service/crud/turn-skip.ts:154, chat/service/party-narration.ts:70.
 * `shadow_notes` and `character_licensing` have no unguarded write site.
 * Do not read this module as a database-level invariant.
 */
const GUARDS: Record<GuardedTable, RowGuard> = {
  messages: guardMessages,
  shadow_notes: guardShadowNotes,
  character_licensing: guardCharacterLicensing,
};

/**
 * Assert a pending write against its table's state-machine invariant.
 * No-op for tables without a guard.
 * @param table - table the row is destined for
 * @param row - the composite state about to be persisted; every axis column of
 *   the table's guard must be present, including values the write does not
 *   change (a partial update must merge the persisted counterpart in).
 * @throws {Error} when a required axis column is missing or the state pair is
 *   not permitted by the table's validator.
 * @returns {void}
 */
export function assertValidWrite(table: TableName, row: Record<string, unknown>,): void {
  const guard = (GUARDS as Partial<Record<TableName, RowGuard>>)[table];
  if (guard) { guard(row,); }
}
