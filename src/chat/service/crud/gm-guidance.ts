// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { jsonStringifyOr, safeJsonParse, } from "../../../utils";
import type { GmConfig, GmGuidance, } from "../../types/config";

/** Result of a GM-guidance update. */
export type UpdateGmGuidanceResult =
  | { ok: true }
  | { code: "not_found"; message: string };

/** Parameters for a runtime GM-guidance patch. */
export interface UpdateGmGuidanceParams {
  storyMode?: boolean;
  gmGuidance?: GmGuidance;
}

/**
 * Patch a chat's human-GM narrative guidance (`gm_config.storyMode` /
 * `gm_config.gmGuidance`) without the online key-mechanic immutability guard.
 *
 * Guidance is runtime narrative state, not a key mechanic, so the GM can steer
 * an in-progress story. Merges over the existing `gm_config` blob.
 */
export async function updateGmGuidance(
  database: Kysely<DB>,
  chatId: string,
  params: UpdateGmGuidanceParams,
): Promise<UpdateGmGuidanceResult> {
  const chat = await database
    .selectFrom("chats",)
    .select("gm_config",)
    .where("id", "=", chatId,)
    .executeTakeFirst();

  if (!chat) {
    return { code: "not_found", message: "Chat not found", };
  }

  const parsed = chat.gm_config
    ? safeJsonParse<GmConfig>(chat.gm_config,)
    : null;
  const current: GmConfig = parsed?.ok ? parsed.value : {};

  const next: GmConfig = {
    ...current,
    ...(params.storyMode !== undefined && { storyMode: params.storyMode, }),
    ...(params.gmGuidance !== undefined && { gmGuidance: params.gmGuidance, }),
  };

  const serialized = jsonStringifyOr(next,);
  await database
    .updateTable("chats",)
    .set({ gm_config: serialized, updated_at: new Date().toISOString(), },)
    .where("id", "=", chatId,)
    .execute();

  return { ok: true, };
}
