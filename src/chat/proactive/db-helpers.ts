// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Proactive Messaging — Row Mapper & DB Helpers
 *
 * Converts between DB rows and domain types.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { jsonParseOr, jsonStringifyOr, } from "../../utils";
import type { ProactiveConfig, ProactiveConfigInput, ProactiveFrequency, } from "./types";

/** */
export interface ProactiveRow {
  id: string;
  chat_id: string;
  actor_id: string;
  frequency: string;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  enabled: number;
  last_proactive_at: string | null;
  backoff_count: number;
  config_json: string;
  created_at: string;
  updated_at: string;
}

/**
 * @param row
 */
export function rowToConfig(row: ProactiveRow,): ProactiveConfig {
  return {
    id: row.id,
    chatId: row.chat_id,
    actorId: row.actor_id,
    frequency: row.frequency as ProactiveFrequency,
    quietHoursStart: row.quiet_hours_start,
    quietHoursEnd: row.quiet_hours_end,
    enabled: row.enabled === 1,
    lastProactiveAt: row.last_proactive_at,
    backoffCount: row.backoff_count,
    configJson: jsonParseOr<Record<string, unknown>>(row.config_json, {},),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * @param db
 * @param chatId
 * @param actorId
 */
export async function selectConfig(
  db: Kysely<DB>,
  chatId: string,
  actorId: string,
): Promise<ProactiveConfig | null> {
  const row = await db
    .selectFrom("proactive_messaging_config",)
    .where("chat_id", "=", chatId,)
    .where("actor_id", "=", actorId,)
    .selectAll()
    .executeTakeFirst();

  return row ? rowToConfig(row,) : null;
}

/**
 * @param db
 * @param chatId
 */
export async function selectChatConfigs(
  db: Kysely<DB>,
  chatId: string,
): Promise<ProactiveConfig[]> {
  const rows = await db
    .selectFrom("proactive_messaging_config",)
    .where("chat_id", "=", chatId,)
    .selectAll()
    .execute() as ProactiveRow[];

  return Array.from(rows, (row,) => rowToConfig(row,),);
}

/**
 * @param db
 * @param chatId
 * @param actorId
 * @param input
 */
export async function insertConfig(
  db: Kysely<DB>,
  chatId: string,
  actorId: string,
  input: ProactiveConfigInput,
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .insertInto("proactive_messaging_config",)
    .values({
      id: crypto.randomUUID(),
      chat_id: chatId,
      actor_id: actorId,
      frequency: input.frequency ?? "normal",
      quiet_hours_start: input.quietHoursStart ?? null,
      quiet_hours_end: input.quietHoursEnd ?? null,
      enabled: (input.enabled === undefined) || input.enabled ? 1 : 0,
      config_json: jsonStringifyOr(input.configJson ?? {},),
      created_at: now,
      updated_at: now,
    },)
    .execute();
}

/**
 * @param db
 * @param chatId
 * @param actorId
 * @param existing
 * @param input
 */
export async function updateConfig(
  db: Kysely<DB>,
  chatId: string,
  actorId: string,
  existing: ProactiveConfig,
  input: ProactiveConfigInput,
): Promise<void> {
  await db
    .updateTable("proactive_messaging_config",)
    .set({
      frequency: input.frequency ?? existing.frequency,
      quiet_hours_start: input.quietHoursStart === undefined ? existing.quietHoursStart : input.quietHoursStart,
      quiet_hours_end: input.quietHoursEnd === undefined ? existing.quietHoursEnd : input.quietHoursEnd,
      enabled: Number(input.enabled ?? existing.enabled,),
      config_json: jsonStringifyOr(input.configJson ?? existing.configJson,),
      updated_at: new Date().toISOString(),
    },)
    .where("chat_id", "=", chatId,)
    .where("actor_id", "=", actorId,)
    .execute();
}

/**
 * @param db
 * @param chatId
 * @param actorId
 * @param since
 */
export async function countMessagesSince(
  db: Kysely<DB>,
  chatId: string,
  actorId: string,
  since: string,
): Promise<number> {
  const result = await db
    .selectFrom("messages",)
    .where("chat_id", "=", chatId,)
    .where("actor_id", "=", actorId,)
    .where("created_at", ">=", since,)
    .select((eb,) => eb.fn.count("id",).as("count",))
    .executeTakeFirst();

  return Number(result?.count ?? 0,);
}
