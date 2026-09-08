// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Persisted workflow run sessions (epic-assistant-creative-studio-workflows).
//
// The in-memory store (`workflow-session.ts`) loses runs on restart or in a
// second process. This module write-throughs runs to the `workflow_sessions`
// table (part 021) and rehydrates them on dispatch. Expiry is lazy: stale
// rows are dropped when next loaded, never by a background job.

import type { Kysely, } from "kysely";
import type { AssistantWorkflowConfig, } from "../config/sections/templates";
import type { DB, } from "../db/schema";
import { jsonParseOr, jsonStringifyOr, } from "../utils";
import { restoreSession, type WorkflowSession, } from "./workflow-session";

/** Runs untouched longer than this are dropped on next load. */
export const WORKFLOW_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Parse a DB timestamp (ISO from app writes, `datetime('now')` from column
 * defaults) as UTC millis. Unknown shapes read as epoch (immediately stale).
 * @param value - Raw timestamp text
 * @returns Millis since epoch
 */
export function parseDbTimestamp(value: string,): number {
  if (value.includes("T",)) {
    const parsed = Date.parse(value,);
    return Number.isNaN(parsed,) ? 0 : parsed;
  }
  const parsed = Date.parse(`${value.replace(" ", "T",)}Z`,);
  return Number.isNaN(parsed,) ? 0 : parsed;
}

/**
 * Write-through a run (insert or replace by chat).
 * @param db - Database
 * @param chatId - Chat owning the session
 * @param session - Run to persist
 */
export async function saveSession(
  db: Kysely<DB>,
  chatId: string,
  session: WorkflowSession,
): Promise<void> {
  const values = {
    chat_id: chatId,
    workflow_id: session.workflow.id,
    step_values: jsonStringifyOr(session.run.values,),
    confirmed: session.run.confirmed ? 1 : 0,
    updated_at: new Date().toISOString(),
  };
  await db
    .insertInto("workflow_sessions",)
    .values(values,)
    .onConflict((oc,) => oc.column("chat_id",).doUpdateSet(values,))
    .execute();
}

/**
 * Rehydrate a persisted run into the in-memory store. Stale rows and rows
 * for unknown workflows are deleted and read as absent.
 * @param db - Database
 * @param chatId - Chat to load
 * @param workflows - Loaded workflow templates for id resolution
 * @returns Restored session, or undefined when none persistable
 */
export async function loadPersistedSession(
  db: Kysely<DB>,
  chatId: string,
  workflows: readonly AssistantWorkflowConfig[],
): Promise<WorkflowSession | undefined> {
  const row = await db
    .selectFrom("workflow_sessions",)
    .selectAll()
    .where("chat_id", "=", chatId,)
    .executeTakeFirst();
  if (!row) { return undefined; }
  const drop = async (): Promise<undefined> => {
    await deletePersistedSession(db, chatId,);
    return undefined;
  };
  if (Date.now() - parseDbTimestamp(row.updated_at,) > WORKFLOW_SESSION_TTL_MS) {
    return drop();
  }
  const workflow = workflows.find((candidate,) => candidate.id === row.workflow_id);
  if (!workflow) { return drop(); }
  const session: WorkflowSession = {
    workflow,
    run: {
      workflowId: workflow.id,
      values: jsonParseOr<Record<string, string | string[]>>(row.step_values, {},),
      confirmed: row.confirmed === 1,
    },
  };
  restoreSession(chatId, session,);
  return session;
}

/**
 * Delete a persisted run (cancel/confirm).
 * @param db - Database
 * @param chatId - Chat to clear
 */
export async function deletePersistedSession(db: Kysely<DB>, chatId: string,): Promise<void> {
  await db.deleteFrom("workflow_sessions",).where("chat_id", "=", chatId,).execute();
}

/**
 * Delete a persisted run, reporting whether one existed.
 * @param db - Database
 * @param chatId - Chat to clear
 * @returns True when a persisted row was deleted
 */
export async function cancelPersistedSession(db: Kysely<DB>, chatId: string,): Promise<boolean> {
  const result = await db.deleteFrom("workflow_sessions",).where("chat_id", "=", chatId,).executeTakeFirst();
  return Number(result.numDeletedRows,) > 0;
}
