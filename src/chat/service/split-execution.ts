// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Auto-execution of party split / reunion from detected narration (C7 remainder).
 *
 * Turns regex-detected split/reunite narration (`detectSplitIntent` /
 * `detectReuniteIntent` in `./split.ts`) into concrete branch specs and runs
 * the existing `splitParty` / `reuniteChats` services. Derivation is fully
 * deterministic — participant names and world locations only — so the per
 * message hot path never pays a second AUX roundtrip (that fallback stays
 * opt-in per `src/chat/split-classifier.ts`).
 *
 * Split derivation: narration is split into clauses; a clause yields a branch
 * when it names a chat participant AND a destination that resolves to a world
 * location. Without two executable branches the narration is logged and
 * skipped — never guessed. Reunite derivation: the current chat's most
 * recently active non-archived child chat (`parent_chat_id`) is the source.
 *
 * Entry points swallow their own errors: an advisory narration signal must
 * never fail the message POST path.
 */
import { type Kysely, sql, } from "kysely";
import { PinnedState, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import type { Logger, } from "../../logger/types";
import { getChat, } from "./crud/get";
import { reuniteChats, splitParty, } from "./split";
import type { SplitBranch, } from "./split";

const MODULE = { module: "chat.split-execution", };

/** Movement verbs that introduce a destination phrase. */
const DESTINATION_PATTERN =
  /\b(?:go(?:es|ing)?|head(?:s|ing)?|travel(?:s|ing)?|sneak(?:s|ing)?|run(?:s|ning)?|walk(?:s|ing)?|ride(?:s|ing)?|venture(?:s)?)\s+(?:off\s+|out\s+)?(?:to|toward|towards|into|for)\s+(?:the\s+)?([a-z][a-z'\u2019 -]{1,39})/i;

/** Clause separators inside a single narration message. */
const CLAUSE_SPLIT = /(?:[.;!?\n]+|\s+and\s+|\s+then\s+|\s+while\s+|,\s*)/i;

/** Trailing connective words trimmed off a captured destination phrase. */
const TRAILING_CONNECTIVE = /\s+(?:with|and|while|then|but|because)\b.*$/i;

/** Extract the destination phrase from one narration clause, if any. */
function extractDestination(clause: string,): string | null {
  const phrase = DESTINATION_PATTERN.exec(clause,)?.[1]?.replace(TRAILING_CONNECTIVE, "",).trim();
  return phrase ? phrase : null;
}

/**
 * Resolve a location name to a world-scoped location row.
 * Exact name match preferred, then a unique LIKE match; ambiguous matches
 * return null.
 */
export async function resolveLocation(
  database: Kysely<DB>,
  locationName: string,
  worldId: string,
): Promise<{ id: string; name?: string } | null> {
  const matches = await database
    .selectFrom("locations",)
    .select(["id", "name",],)
    .where("world_id", "=", worldId,)
    .where("name", "like", `%${locationName}%`,)
    .execute();

  const exact = matches.find(m => m.name === locationName);
  if (exact) { return exact; }

  if (matches.length === 1) { return matches[0] ?? null; }

  if (matches.length > 1) {
    getLogger().child(MODULE,).warn("Ambiguous location match, skipping", {
      locationName,
      matches: Array.from(matches, loc => loc.name,),
    },);
  }

  return null;
}

/**
 * Derive executable split branch specs from narration: each clause naming
 * >=1 chat participant plus a world-resolvable destination becomes a branch
 * (actors claimed earlier are not re-assigned). Null unless >=2 branches.
 */
export async function deriveSplitBranches(
  database: Kysely<DB>,
  params: { chatId: string; narration: string; worldId: string },
): Promise<SplitBranch[] | null> {
  const { chatId, narration, worldId, } = params;

  const record = await getChat(database, chatId,);
  if (!record) { return null; }

  const namedActors = record.participants.length === 0
    ? []
    : await database
      .selectFrom("actors",)
      .select(["id", "display_name",],)
      .where("id", "in", record.participants.map(p => p.actor_id),)
      .execute();

  const branches: SplitBranch[] = [];
  const assigned = new Set<string>();

  for (const clause of narration.split(CLAUSE_SPLIT,)) {
    const lowerClause = clause.toLowerCase();
    const actorIds = namedActors
      .filter(a =>
        a.display_name.length > 0 &&
        lowerClause.includes(a.display_name.toLowerCase(),) &&
        !assigned.has(a.id,)
      )
      .map(a => a.id);

    const destinationPhrase = extractDestination(clause,);
    if (actorIds.length === 0 || !destinationPhrase) { continue; }

    const location = await resolveLocation(database, destinationPhrase, worldId,);
    if (!location) { continue; }

    for (const actorId of actorIds) { assigned.add(actorId,); }
    branches.push({
      actorIds,
      locationId: location.id,
      name: location.name ?? `Location ${location.id.slice(0, 8,)}`,
    },);
  }

  return branches.length >= 2 ? branches : null;
}

/**
 * Resolve the acting actor to the user id the ownership guards compare
 * against (`chats.created_by`): linked user first, then owner. Logs a skip
 * reason and returns null when the actor has no linked user.
 */
async function requireLinkedUser(
  database: Kysely<DB>,
  logger: Logger,
  params: { chatId: string; actorId: string; kind: string },
): Promise<string | null> {
  const { chatId, actorId, kind, } = params;
  const actor = await database
    .selectFrom("actors",)
    .select(["user_id", "owner_id",],)
    .where("id", "=", actorId,)
    .executeTakeFirst();

  const userId = actor?.user_id ?? actor?.owner_id ?? null;
  if (!userId) {
    logger.info(`${kind} narration from an actor without a linked user — skipping`, { chatId, actorId, },);
  }

  return userId;
}

/** Log a swallowed execution failure; the message POST path must not break. */
function logExecFailure(kind: string, chatId: string, error: unknown,): void {
  getLogger().child(MODULE,).warn(`Narration ${kind} execution failed — message path unaffected`, {
    chatId,
    error: error instanceof Error ? error.message : String(error,),
  },);
}

/**
 * Execute a party split from detected narration. Derives branch specs
 * deterministically (see {@link deriveSplitBranches}); narration without two
 * executable branches is logged and skipped. Owner enforcement stays in
 * `splitParty`. Never throws.
 */
export async function executeSplitFromNarration(
  database: Kysely<DB>,
  params: { chatId: string; actorId: string; narration: string },
): Promise<void> {
  const { chatId, actorId, narration, } = params;
  const logger = getLogger().child(MODULE,);

  try {
    const record = await getChat(database, chatId,);
    const worldId = record?.chat.world_id ?? null;

    if (!worldId) {
      logger.info("Split narration without a world — skipping execution", { chatId, },);
      return;
    }

    const userId = await requireLinkedUser(database, logger, { chatId, actorId, kind: "Split", },);
    if (!userId) { return; }

    const branches = await deriveSplitBranches(database, { chatId, narration, worldId, },);
    if (!branches) {
      logger.info("Split narration has no executable branch specs — skipping", { chatId, },);
      return;
    }

    const result = await splitParty(database, { chatId, actorId: userId, branches, },);
    if ("code" in result) {
      logger.warn("Narration split rejected by service", { chatId, code: result.code, message: result.message, },);
      return;
    }

    logger.info("Party split executed from narration", {
      chatId,
      branchCount: result.branches.length,
      branches: result.branches,
    },);
  } catch (error) {
    logExecFailure("split", chatId, error,);
  }
}

/**
 * Execute a party reunion from detected narration: the current chat's most
 * recently active non-archived child chat is the merge source; without one
 * the narration is logged and skipped. Owner enforcement stays in
 * `reuniteChats`. Never throws.
 */
export async function executeReuniteFromNarration(
  database: Kysely<DB>,
  params: { chatId: string; actorId: string },
): Promise<void> {
  const { chatId, actorId, } = params;
  const logger = getLogger().child(MODULE,);

  try {
    // joined_at/updated_at have second precision, so same-instant updates
    // tie; rowid breaks the tie by insertion order (BUG-12f087e pattern).
    const secondary = await database
      .selectFrom("chats",)
      .select(["id",],)
      .where("parent_chat_id", "=", chatId,)
      .where("is_pinned", "!=", PinnedState.Archived,)
      .orderBy("updated_at", "desc",)
      .orderBy(sql`rowid`, "desc",)
      .limit(1,)
      .executeTakeFirst();

    if (!secondary) {
      logger.info("Reunite narration without an active branch chat — skipping", { chatId, },);
      return;
    }

    const userId = await requireLinkedUser(database, logger, { chatId, actorId, kind: "Reunite", },);
    if (!userId) { return; }

    const result = await reuniteChats(database, {
      primaryChatId: chatId,
      secondaryChatId: secondary.id,
      actorId: userId,
    },);

    if ("code" in result) {
      logger.warn("Narration reunite rejected by service", { chatId, code: result.code, message: result.message, },);
      return;
    }

    logger.info("Party reunite executed from narration", {
      chatId,
      secondaryChatId: secondary.id,
      mergedMessageCount: result.mergedMessageCount,
    },);
  } catch (error) {
    logExecFailure("reunite", chatId, error,);
  }
}
