/**
 * Chat Invites — DB Schema
 *
 * Adds a `chat_invites` table for the invite/join mechanics. An invite is a
 * short, shareable code bound to a chat. Anyone holding a valid code can join
 * the chat as a participant (role "member").
 *
 * Invites are created by the chat owner (or admin). A code is redeemable until
 * it is revoked, expires, or exhausts its `max_uses`. `uses` tracks how many
 * times it has been redeemed.
 *
 * Join semantics: redeeming an invite adds the joining user's actor to
 * `chat_participants` (see routes/invites.ts). Access control is enforced at
 * the service/route layer — the table itself only persists invite state.
 *
 * See .plan/tickets/invite-code-generation.md and .plan/tickets/join-flow-mechanics.md.
 */
import type { Kysely, } from "kysely";

export async function up(db: Kysely<unknown>,): Promise<void> {
  await db.schema
    .createTable("chat_invites",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.references("chats.id",).onDelete("cascade",).notNull(),)
    .addColumn("code", "text", (col,) => col.notNull().unique(),)
    .addColumn("created_by", "text", (col,) => col.references("users.id",).onDelete("set null",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(new Date().toISOString(),),)
    .addColumn("expires_at", "text",)
    .addColumn("max_uses", "integer",)
    .addColumn("uses", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("active",),)
    .execute();

  await db.schema
    .createIndex("chat_invites_chat_idx",)
    .on("chat_invites",)
    .columns(["chat_id",],)
    .execute();

  // ── World membership + invites ────────────────────────────
  // Flat membership (no roles): a row means the actor is "in the server".
  // Populated by redeeming a world invite (see chat/world-invites.ts).
  await db.schema
    .createTable("world_members",)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",).onDelete("cascade",).notNull(),)
    .addColumn("actor_id", "text", (col,) => col.references("actors.id",).onDelete("cascade",).notNull(),)
    .addPrimaryKeyConstraint("pk_world_members", ["world_id", "actor_id",],)
    .execute();

  // Mirror of chat_invites, scoped to a world: redeeming joins the world.
  await db.schema
    .createTable("world_invites",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",).onDelete("cascade",).notNull(),)
    .addColumn("code", "text", (col,) => col.notNull().unique(),)
    .addColumn("created_by", "text", (col,) => col.references("users.id",).onDelete("set null",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(new Date().toISOString(),),)
    .addColumn("expires_at", "text",)
    .addColumn("max_uses", "integer",)
    .addColumn("uses", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("active",),)
    .execute();

  await db.schema
    .createIndex("world_invites_world_idx",)
    .on("world_invites",)
    .columns(["world_id",],)
    .execute();
}

export async function down(db: Kysely<unknown>,): Promise<void> {
  await db.schema.dropIndex("world_invites_world_idx",).execute();
  await db.schema.dropTable("world_invites",).execute();
  await db.schema.dropTable("world_members",).execute();
  await db.schema.dropIndex("chat_invites_chat_idx",).execute();
  await db.schema.dropTable("chat_invites",).execute();
}
