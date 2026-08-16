// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { jsonStringifyOr, } from "../../utils.js";
import { log, } from "./log.js";
import type { RpgServiceDeps, } from "./types.js";

export interface LogDiceRollParams {
  userId: string;
  chatId?: string;
  actorId?: string;
  sides: number;
  count: number;
  modifier: number;
  advantageMode: string;
  exploding: boolean;
  rawRolls: number[];
  rawTotal: number;
  total: number;
  purpose?: string;
}

export async function logDiceRoll(
  deps: RpgServiceDeps,
  params: LogDiceRollParams,
): Promise<string> {
  const { database, } = deps;
  const id = crypto.randomUUID();

  await database
    .insertInto("dice_roll_history",)
    .values({
      id,
      user_id: params.userId,
      chat_id: params.chatId ?? null,
      actor_id: params.actorId ?? null,
      sides: params.sides,
      count: params.count,
      modifier: params.modifier,
      advantage_mode: params.advantageMode,
      exploding: params.exploding ? 1 : 0,
      raw_rolls: jsonStringifyOr(params.rawRolls,),
      raw_total: params.rawTotal,
      total: params.total,
      purpose: params.purpose ?? null,
    },)
    .execute();

  log().debug("Logged dice roll", { id, total: params.total, },);
  return id;
}

export async function getDiceRollHistory(
  deps: RpgServiceDeps,
  params: { userId: string; chatId?: string; limit?: number },
): Promise<
  {
    id: string;
    sides: number;
    count: number;
    modifier: number;
    advantageMode: string;
    total: number;
    purpose: string | null;
    createdAt: string;
  }[]
> {
  const { database, } = deps;
  const limit = params.limit ?? 50;

  let query = database
    .selectFrom("dice_roll_history",)
    .where("user_id", "=", params.userId,)
    .select([
      "id",
      "sides",
      "count",
      "modifier",
      "advantage_mode",
      "total",
      "purpose",
      "created_at",
    ],)
    .orderBy("created_at", "desc",)
    .limit(limit,);

  if (params.chatId) {
    query = query.where("chat_id", "=", params.chatId,);
  }

  const rows = await query.execute();

  return Array.from(rows, (r,) => ({
    id: r.id,
    sides: r.sides,
    count: r.count,
    modifier: r.modifier,
    advantageMode: r.advantage_mode,
    total: r.total,
    purpose: r.purpose,
    createdAt: r.created_at,
  }),);
}
