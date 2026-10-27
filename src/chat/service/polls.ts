// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 430
// Cohesive single-purpose poll service (types + logic together).

/**
 * Message polls (TASK-message-polls-votes).
 *
 * One poll per message; participants vote via `poll_votes`. Single-choice
 * polls replace the voter's previous option; multi-choice polls toggle an
 * option (the (poll_id, user_id, option_idx) unique constraint dedups
 * double-votes at the schema level). Closed polls reject votes with a
 * `conflict` ServiceError (HTTP 409 at the route layer).
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { can, } from "../../users/permissions";
import { jsonParseOr, safeJsonStringify, uid, } from "../../utils";
import { checkChatAccess, } from "./access";
import type { ServiceError, } from "./types";

// ── Types ──────────────────────────────────────────────────────────────────

/** */
export interface PollTally {
  optionIdx: number;
  count: number;
}

/** A poll with per-option tallies and the viewer's current votes. */
export interface MessagePoll {
  id: string;
  messageId: string;
  question: string;
  options: string[];
  multi: boolean;
  closed: boolean;
  closesAt: string | null;
  createdBy: string;
  tallies: PollTally[];
  viewerOptionIdxs: number[];
}

/** */
export interface CreatePollParams {
  database: Kysely<DB>;
  messageId: string;
  userId: string;
  userRole: string | null;
  question: string;
  options: string[];
  multi: boolean;
  closesAt?: string | null;
}

/** */
export type CreatePollResult =
  | { ok: true; poll: MessagePoll }
  | { ok: false; error: ServiceError };

/** */
export interface VotePollParams {
  database: Kysely<DB>;
  messageId: string;
  userId: string;
  userRole: string | null;
  optionIdx: number;
}

/** */
export type VotePollResult =
  | { ok: true; poll: MessagePoll }
  | { ok: false; error: ServiceError };

/** */
export interface ClosePollParams {
  database: Kysely<DB>;
  messageId: string;
  userId: string;
  userRole: string | null;
}

/** */
export type ClosePollResult =
  | { ok: true; poll: MessagePoll }
  | { ok: false; error: ServiceError };

/** */
export interface ListPollsParams {
  database: Kysely<DB>;
  chatId: string;
  userId: string;
  userRole: string | null;
}

/** */
export type ListPollsResult =
  | { ok: true; polls: MessagePoll[] }
  | { ok: false; error: ServiceError };

/** */
export interface GetPollParams {
  database: Kysely<DB>;
  messageId: string;
  userId: string;
  userRole: string | null;
}

/** */
export type GetPollResult =
  | { ok: true; poll: MessagePoll }
  | { ok: false; error: ServiceError };

// ── Limits ─────────────────────────────────────────────────────────────────

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 10;
const MAX_QUESTION_LENGTH = 500;
const MAX_OPTION_LENGTH = 200;

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Validate poll options (trimmed, non-empty, within limits).
 * @throws never — returns a ServiceError instead
 */
function validatePollInput(
  question: string,
  options: string[],
): ServiceError | null {
  if (question.trim().length === 0 || question.length > MAX_QUESTION_LENGTH) {
    return {
      code: "bad_request",
      message: `Poll question must be 1-${MAX_QUESTION_LENGTH} characters`,
    };
  }

  if (
    options.length < MIN_OPTIONS ||
    options.length > MAX_OPTIONS ||
    options.some((o,) => o.trim().length === 0 || o.length > MAX_OPTION_LENGTH)
  ) {
    return {
      code: "bad_request",
      message: `Poll needs ${MIN_OPTIONS}-${MAX_OPTIONS} non-empty options (max ${MAX_OPTION_LENGTH} chars each)`,
    };
  }

  return null;
}

/** Resolve a message's chat and verify participant access. */
async function resolveMessageAccess(
  database: Kysely<DB>,
  messageId: string,
  userId: string,
  userRole: string | null,
): Promise<{ ok: true; chatId: string } | { ok: false; error: ServiceError }> {
  const msg = await database
    .selectFrom("messages",)
    .select(["chat_id",],)
    .where("id", "=", messageId,)
    .executeTakeFirst();

  if (!msg) {
    return { ok: false, error: { code: "not_found", message: "Message not found", }, };
  }

  const access = await checkChatAccess(database, msg.chat_id, userId, userRole,);
  if (!access.ok) {
    return { ok: false, error: { code: "not_found", message: "Message not found", }, };
  }

  return { ok: true, chatId: msg.chat_id, };
}

/** Fetch a poll row with tallies and the viewer's votes. */
async function hydratePoll(
  database: Kysely<DB>,
  pollId: string,
  messageId: string,
  viewerId: string,
): Promise<MessagePoll | null> {
  const poll = await database
    .selectFrom("message_polls",)
    .select([
      "id",
      "question",
      "options",
      "multi",
      "closes_at",
      "closed_at",
      "created_by",
    ],)
    .where("id", "=", pollId,)
    .executeTakeFirst();

  if (!poll) { return null; }

  const votes = await database
    .selectFrom("poll_votes",)
    .select(["user_id", "option_idx",],)
    .where("poll_id", "=", pollId,)
    .execute();

  const tallies = new Map<number, number>();
  const viewerOptionIdxs: number[] = [];
  for (const v of votes) {
    tallies.set(v.option_idx, (tallies.get(v.option_idx,) ?? 0) + 1,);
    if (v.user_id === viewerId) { viewerOptionIdxs.push(v.option_idx,); }
  }

  let options: string[] = [];
  const parsed: unknown = jsonParseOr(poll.options, null,);
  if (Array.isArray(parsed,)) { options = parsed.filter((o,): o is string => typeof o === "string"); }

  return {
    id: poll.id,
    messageId,
    question: poll.question,
    options,
    multi: poll.multi !== 0,
    closed: poll.closed_at !== null,
    closesAt: poll.closes_at,
    createdBy: poll.created_by,
    tallies: Array.from(tallies, ([optionIdx, count,],) => ({ optionIdx, count, }),),
    viewerOptionIdxs,
  };
}

/** Is this user allowed to close the poll (creator, chat owner, admin)? */
async function canClosePoll(
  database: Kysely<DB>,
  chatId: string,
  createdBy: string,
  userId: string,
  userRole: string | null,
): Promise<boolean> {
  if (createdBy === userId) { return true; }
  if (can(userRole, "admin.chat",)) { return true; }
  const chat = await database
    .selectFrom("chats",)
    .select("created_by",)
    .where("id", "=", chatId,)
    .executeTakeFirst();

  return chat?.created_by === userId;
}

// ── Service ────────────────────────────────────────────────────────────────

/**
 * Create the poll attached to a message (one per message).
 * @throws never — returns a Result instead
 */
export async function createPoll(
  params: CreatePollParams,
): Promise<CreatePollResult> {
  const { database, messageId, userId, userRole, question, options, multi, closesAt, } = params;
  const inputError = validatePollInput(question, options,);
  if (inputError) { return { ok: false, error: inputError, }; }

  const access = await resolveMessageAccess(database, messageId, userId, userRole,);
  if (!access.ok) { return access; }

  const existing = await database
    .selectFrom("message_polls",)
    .select("id",)
    .where("message_id", "=", messageId,)
    .executeTakeFirst();

  if (existing) {
    return {
      ok: false,
      error: { code: "conflict", message: "Message already has a poll", },
    };
  }

  const pollId = uid();
  const serialized = safeJsonStringify(options.map((o,) => o.trim()),);
  if (!serialized.ok) {
    return {
      ok: false,
      error: { code: "bad_request", message: "Poll options could not be serialized", },
    };
  }

  try {
    await database
      .insertInto("message_polls",)
      .values({
        id: pollId,
        message_id: messageId,
        question: question.trim(),
        options: serialized.value,
        multi: multi ? 1 : 0,
        created_by: userId,
        closes_at: closesAt ?? null,
      },)
      .execute();
  } catch (error) {
    // A concurrent createPoll on the same message lost the race: the UNIQUE
    // index on message_polls.message_id rejects the second row. Translate it
    // into the same conflict Result the sequential pre-check returns, so the
    // route answers 409 instead of surfacing a raw driver error.
    if (!(error instanceof Error && error.message.includes("UNIQUE constraint failed",))) { throw error; }

    return {
      ok: false,
      error: { code: "conflict", message: "Message already has a poll", },
    };
  }

  const poll = await hydratePoll(database, pollId, messageId, userId,);
  if (!poll) {
    return {
      ok: false,
      error: { code: "bad_request", message: "Poll creation failed", },
    };
  }

  return { ok: true, poll, };
}

/**
 * Cast (or, for single-choice polls, replace) the viewer's vote.
 * Closed polls reject with `conflict`.
 * @throws never — returns a Result instead
 */
export async function votePoll(
  params: VotePollParams,
): Promise<VotePollResult> {
  const { database, messageId, userId, userRole, optionIdx, } = params;
  const access = await resolveMessageAccess(database, messageId, userId, userRole,);
  if (!access.ok) { return access; }

  const poll = await database
    .selectFrom("message_polls",)
    .select(["id", "options", "multi", "closed_at",],)
    .where("message_id", "=", messageId,)
    .executeTakeFirst();

  if (!poll) {
    return { ok: false, error: { code: "not_found", message: "Poll not found", }, };
  }

  if (poll.closed_at !== null) {
    return {
      ok: false,
      error: { code: "conflict", message: "Poll is closed", },
    };
  }

  const parsed: unknown = jsonParseOr(poll.options, null,);
  const optionCount = Array.isArray(parsed,) ? parsed.length : 0;

  if (!Number.isInteger(optionIdx,) || optionIdx < 0 || optionIdx >= optionCount) {
    return {
      ok: false,
      error: { code: "bad_request", message: "Invalid option index", },
    };
  }

  if (poll.multi === 0) {
    // Single choice: replace the voter's previous option.
    await database
      .deleteFrom("poll_votes",)
      .where("poll_id", "=", poll.id,)
      .where("user_id", "=", userId,)
      .execute();
  }

  await database
    .insertInto("poll_votes",)
    .values({ id: uid(), poll_id: poll.id, user_id: userId, option_idx: optionIdx, },)
    .onConflict((oc,) => oc.doNothing())
    .execute();

  const hydrated = await hydratePoll(database, poll.id, messageId, userId,);
  if (!hydrated) {
    return { ok: false, error: { code: "not_found", message: "Poll not found", }, };
  }

  return { ok: true, poll: hydrated, };
}

/**
 * Close a poll (creator, chat owner, or admin). Idempotent: closing an
 * already-closed poll returns the current state.
 * @throws never — returns a Result instead
 */
export async function closePoll(
  params: ClosePollParams,
): Promise<ClosePollResult> {
  const { database, messageId, userId, userRole, } = params;
  const access = await resolveMessageAccess(database, messageId, userId, userRole,);
  if (!access.ok) { return access; }

  const poll = await database
    .selectFrom("message_polls",)
    .select(["id", "closed_at", "created_by",],)
    .where("message_id", "=", messageId,)
    .executeTakeFirst();

  if (!poll) {
    return { ok: false, error: { code: "not_found", message: "Poll not found", }, };
  }

  if (poll.closed_at === null) {
    const allowed = await canClosePoll(
      database,
      access.chatId,
      poll.created_by,
      userId,
      userRole,
    );

    if (!allowed) {
      return {
        ok: false,
        error: { code: "forbidden", message: "Only the poll creator, chat owner, or admin can close a poll", },
      };
    }

    await database
      .updateTable("message_polls",)
      .set({ closed_at: new Date().toISOString(), },)
      .where("id", "=", poll.id,)
      .execute();
  }

  const hydrated = await hydratePoll(database, poll.id, messageId, userId,);
  if (!hydrated) {
    return { ok: false, error: { code: "not_found", message: "Poll not found", }, };
  }

  return { ok: true, poll: hydrated, };
}

/**
 * Read the poll attached to a message with tallies and the viewer's votes.
 * @throws never — returns a Result instead
 */
export async function getMessagePoll(
  params: GetPollParams,
): Promise<GetPollResult> {
  const { database, messageId, userId, userRole, } = params;
  const access = await resolveMessageAccess(database, messageId, userId, userRole,);
  if (!access.ok) { return access; }

  const row = await database
    .selectFrom("message_polls",)
    .select("id",)
    .where("message_id", "=", messageId,)
    .executeTakeFirst();

  if (!row) {
    return { ok: false, error: { code: "not_found", message: "Poll not found", }, };
  }

  const poll = await hydratePoll(database, row.id, messageId, userId,);
  if (!poll) {
    return { ok: false, error: { code: "not_found", message: "Poll not found", }, };
  }

  return { ok: true, poll, };
}

/**
 * List every poll in a chat with tallies and the viewer's votes.
 * @throws never — returns a Result instead
 */
export async function listChatPolls(
  params: ListPollsParams,
): Promise<ListPollsResult> {
  const { database, chatId, userId, userRole, } = params;
  const access = await checkChatAccess(database, chatId, userId, userRole,);
  if (!access.ok) {
    return { ok: false, error: { code: "not_found", message: "Chat not found", }, };
  }

  const polls = await database
    .selectFrom("message_polls",)
    .innerJoin("messages", "messages.id", "message_polls.message_id",)
    .select(["message_polls.id", "message_polls.message_id",],)
    .where("messages.chat_id", "=", chatId,)
    .execute();

  const hydrated: MessagePoll[] = [];
  for (const row of polls) {
    const poll = await hydratePoll(database, row.id, row.message_id, userId,);
    if (poll) { hydrated.push(poll,); }
  }

  return { ok: true, polls: hydrated, };
}
