// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Archive Expiration GC (FEAT-chat-archive-gc-job).
 */
import type { Kysely, } from "kysely";
import { ARCHIVE_RETENTION_DAYS_DEFAULT, getConfigValue, } from "../admin/config";
import { hardDeleteChat, } from "../chat/service/visibility";
import { PinnedState, } from "../db/enums";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import type { Logger, } from "../logger/types";
import { toDate, } from "../utils/date";
import { safeJsonStringify, } from "../utils/safe-json";

export interface ArchiveExpirationSummary {
  scanned: number;
  purged: number;
  skipped: number;
}

export interface RunArchiveExpirationGcOpts {
  retentionDays?: number;
  logger?: Logger;
  now?: Date;
}

function resolveRetentionDays(raw: string | undefined,): number {
  const parsed = Number(raw,);
  return Number.isFinite(parsed,) && parsed >= 1 ? parsed : ARCHIVE_RETENTION_DAYS_DEFAULT;
}

/**
 * @param {Kysely<DB>} database
 * @param {RunArchiveExpirationGcOpts} opts
 * @returns {Promise<ArchiveExpirationSummary>}
 */
export async function runArchiveExpirationGc(
  database: Kysely<DB>,
  opts: RunArchiveExpirationGcOpts = {},
): Promise<ArchiveExpirationSummary> {
  const log = opts.logger ?? getLogger().child({ module: "archive-gc", },);
  const nowDate = opts.now ?? new Date();
  const nowMs = nowDate.getTime();
  const retentionDays = opts.retentionDays ??
    resolveRetentionDays(await getConfigValue(database, "archive_retention_days",),);

  const cutoffMs = nowMs - retentionDays * 86_400_000;
  const cutoff = toDate(cutoffMs,).toISOString();

  const rows = await database
    .selectFrom("chats",)
    .select(["id", "created_by",],)
    .where("is_pinned", "=", PinnedState.Archived,)
    .where("updated_at", "<", cutoff,)
    .execute();

  let purged = 0;
  let skipped = 0;
  for (const row of rows) {
    try {
      const result = await hardDeleteChat(database, row.id, row.created_by, "admin",);
      if ("code" in result) {
        skipped += 1;
        log.warn("archive gc skipped chat", { chatId: row.id, code: result.code, },);
        continue;
      }

      purged += 1;
      log.info("archive gc purged chat", { chatId: row.id, retentionDays, cutoff, },);
      const nowIso = toDate(nowMs,).toISOString();
      const metaResult = safeJsonStringify({ retentionDays, cutoff, },);
      const meta = metaResult.ok ? metaResult.value : "{}";
      await database
        .insertInto("log_entries",)
        .values({
          id: crypto.randomUUID(),
          level: 30,
          timestamp: nowMs,
          time: nowIso,
          message: "Archive retention sweep purged chat",
          module: "archive-gc",
          user_id: row.created_by,
          meta,
          event_type: "chat.archive_expired",
          entity_type: "chat",
          entity_id: row.id,
          created_at: nowIso,
        },)
        .execute();
    } catch (error: unknown) {
      skipped += 1;
      log.warn(
        "archive gc failed to purge chat",
        { chatId: row.id, error: error instanceof Error ? error.message : String(error,), },
      );
    }
  }

  return { scanned: rows.length, purged, skipped, };
}
