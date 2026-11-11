/**
 * 100_harness_queue_turns
 *
 * Persistent multi-agent turn queue (TASK-harness-multi-agent-turn-queue):
 * one row per harness turn the queue will run, so the queue's state survives
 * a process restart instead of living in memory next to the in-flight turn.
 *
 *  - `batch_id` groups the turns enqueued together (one operator action
 *    fanning out to several profiles). The batch itself is deliberately NOT
 *    a row: its status is the aggregate of its turns, so there is no second
 *    state machine to crash mid-write.
 *  - `status` is the row's state machine (queued → running → completed |
 *    failed | cancelled; `HarnessQueueTurnStatus`). Crash safety rides it:
 *    boot recovery fails any `running` row with `interrupted` (the ACP
 *    session died with the process) and leaves `queued` rows to be claimed
 *    by the next pump.
 *  - `requested_by`/`requested_role` snapshot the ENQUEUEING principal: the
 *    turn runs later, under the principal that asked for it (the isolation
 *    gate re-judges at dispatch time), never under the queue's own
 *    authority.
 *  - Failure is terminal: `error_code`/`error_message` record why
 *    (`HarnessQueueErrorCode` — the `HarnessDispatchCode` vocabulary plus
 *    `interrupted`); there is no automatic retry, re-enqueue is the explicit
 *    retry. `attempts` counts claims for observability, not a retry budget.
 */
import type { Kysely, } from "kysely";
import { sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("harness_queue_turns",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("batch_id", "text", (col,) => col.notNull(),)
    .addColumn("profile", "text", (col,) => col.notNull(),)
    .addColumn("prompt", "text", (col,) => col.notNull(),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("queued",),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("requested_by", "text", (col,) => col.notNull().references("users.id",).onDelete("cascade",),)
    .addColumn("requested_role", "text",)
    .addColumn("turn_key", "text",)
    .addColumn("attempts", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("result_message_id", "text",)
    .addColumn("error_code", "text",)
    .addColumn("error_message", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("started_at", "text",)
    .addColumn("finished_at", "text",)
    .execute();

  // The pump scans for claimable work in enqueue order; the batch index
  // serves the per-batch status listing.
  await sql`
    CREATE INDEX IF NOT EXISTS idx_harness_queue_turns_status
    ON harness_queue_turns (status, created_at)
  `.execute(database,);

  await sql`
    CREATE INDEX IF NOT EXISTS idx_harness_queue_turns_batch
    ON harness_queue_turns (batch_id)
  `.execute(database,);
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_harness_queue_turns_batch`.execute(database,);
  await sql`DROP INDEX IF EXISTS idx_harness_queue_turns_status`.execute(database,);
  await database.schema.dropTable("harness_queue_turns",).execute();
}
