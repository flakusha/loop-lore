// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/integrations/loop-lore-facade/ops/memory.ts — facade ops over an
// actor's memories (harness parity gap #6: memory had no facade op).
//
// SECURITY: the memory's character must belong to the CALLING user (the
// repo's owner_id / user_id links), and the repo's OWN privacy model decides
// the rest: `isMemoryVisible` (src/memory/shareability.ts) grants a memory to
// its owner-as-viewer only, so a facade caller — a tool acting for the user,
// not the character — never receives a private or secret memory. The scopes
// shared beyond the actor (world, party, timeline) are excluded too: the
// facade carries no chat/timeline context to verify them against.

import { type Static, } from "@sinclair/typebox";
import { Value, } from "@sinclair/typebox/value";
import { t, } from "elysia";
import type { Kysely, } from "kysely";
import { chatPolicy, } from "../../../api-governance/rate-limiting/policies";
import type { Config, } from "../../../config/schema";
import type { DB, } from "../../../db/schema";
import { isMemoryVisible, } from "../../../memory/shareability";
import type { MemoryPrivacy, } from "../../../memory/types";
import { type FacadeRegistry, } from "../registry";
import type { FacadeContext, FacadeOp, FacadeOutputSchema, FacadeResult, } from "../types";
import { badBodyResult, callerIdentity, callerOwnsActor, notFoundResult, READ_ONLY_ANNOTATIONS, } from "./shared";

/** Shared registration deps — the same shape the other op modules carry. */
export interface MemoryFacadeDeps {
  database: Kysely<DB>;
  config: Config;
}

/** memory.list body: the character and the chat whose memories are listed. */
export const MemoryListBody = t.Object({
  actorId: t.String({ minLength: 1, },),
  chatId: t.String({ minLength: 1, },),
},);

/** memory.get body: the memory id. */
export const MemoryGetBody = t.Object({ memoryId: t.String({ minLength: 1, },), },);

/** The scopes the facade surfaces: the per-actor and the per-user one. */
const FACADE_MEMORY_SCOPES: readonly string[] = ["character", "assistant",];

/** The privacy vocabulary the repo stores (src/memory/types.ts). */
const MEMORY_PRIVACIES: readonly MemoryPrivacy[] = ["public", "shared", "private", "secret",];

/** The summary fields memory.list returns — never the memory's text. */
const MEMORY_SUMMARY_PROPERTIES = {
  id: { type: "string", },
  memoryType: { type: "string", },
  scope: { type: "string", },
  privacy: { type: "string", },
  importance: { type: "number", },
  confidence: { type: "number", },
  pinned: { type: "string", },
  sourceChatId: { type: "string", },
  createdAt: { type: "string", },
};

/** memory.list's structured result: the summaries + the total count. */
export const MemoryListOutputSchema: FacadeOutputSchema = {
  type: "object",
  properties: {
    data: { type: "array", items: { type: "object", properties: MEMORY_SUMMARY_PROPERTIES, }, },
    total: { type: "number", },
  },
  required: ["data", "total",],
};

/** memory.get's structured result: one memory's text + its metadata. */
export const MemoryDetailOutputSchema: FacadeOutputSchema = {
  type: "object",
  properties: { ...MEMORY_SUMMARY_PROPERTIES, content: { type: "string", }, },
  required: ["id", "content", "memoryType", "scope", "privacy", "createdAt",],
};

/** The memory row fields the facade reads. */
interface MemoryRow {
  id: string;
  actor_id: string;
  content: string;
  memory_type: string;
  scope: string;
  privacy: string;
  importance: number;
  confidence: number;
  pinned: string;
  source_chat_id: string | null;
  created_at: string;
}

/**
 * Narrow a stored privacy string into the repo's privacy vocabulary.
 * @param value - the stored privacy column
 * @returns the privacy level, or null when the column holds something else
 */
function toMemoryPrivacy(value: string,): MemoryPrivacy | null {
  return MEMORY_PRIVACIES.find((privacy,) => privacy === value) ?? null;
}

/**
 * Whether the facade may surface this memory: the scope must be one the
 * facade can verify, and the repo's own privacy model must admit the caller.
 * @param memory - the memory row
 * @param viewerId - the calling user id
 * @returns true when the memory may be returned
 */
function memoryVisibleTo(memory: MemoryRow, viewerId: string,): boolean {
  if (!FACADE_MEMORY_SCOPES.includes(memory.scope,)) { return false; }

  const privacy = toMemoryPrivacy(memory.privacy,);
  if (privacy === null) { return false; }

  return isMemoryVisible(privacy, memory.actor_id, viewerId,);
}

/**
 * Project a memory row onto the summary a facade caller sees (no text).
 * @param memory - the memory row
 * @returns the summary projection
 */
function toMemorySummary(memory: MemoryRow,): Record<string, unknown> {
  return {
    id: memory.id,
    memoryType: memory.memory_type,
    scope: memory.scope,
    privacy: memory.privacy,
    importance: memory.importance,
    confidence: memory.confidence,
    pinned: memory.pinned,
    sourceChatId: memory.source_chat_id,
    createdAt: memory.created_at,
  };
}

/**
 * Register the memory ops on a registry.
 * @param registry - the facade registry
 * @param deps - database/config the ops read through
 * @throws {Error} when an op name collides on registration
 */
export function registerMemoryOps(registry: FacadeRegistry, deps: MemoryFacadeDeps,): void {
  const { database, } = deps;

  const ops: FacadeOp[] = [
    {
      name: "memory.list",
      domain: "memory",
      summary: "List an actor's memories for one chat",
      description: "The character must belong to the calling user. Only the per-actor and per-user " +
        "scopes are surfaced, and the repo's privacy model decides the rest — a private or secret " +
        "memory is never returned. The list carries the memories' metadata, not their text.",
      scope: "read",
      ratePolicy: chatPolicy,
      bodySchema: MemoryListBody,
      annotations: READ_ONLY_ANNOTATIONS,
      outputSchema: MemoryListOutputSchema,
      handler: async (ctx: FacadeContext, body: unknown,): Promise<FacadeResult> => {
        if (!Value.Check(MemoryListBody, body,)) { return badBodyResult("memory.list",); }
        const parsed = body as Static<typeof MemoryListBody>;
        const { userId, } = callerIdentity(ctx,);

        const owned = await callerOwnsActor({ database, actorId: parsed.actorId, userId, },);
        if (!owned) { return notFoundResult("character not found",); }

        const rows = await database
          .selectFrom("actor_memories",)
          .selectAll()
          .where("actor_id", "=", parsed.actorId,)
          .where("source_chat_id", "=", parsed.chatId,)
          .where("scope", "in", FACADE_MEMORY_SCOPES,)
          .where("review_status", "=", "committed",)
          .orderBy("created_at", "desc",)
          .orderBy("id", "asc",)
          .limit(200,)
          .execute();

        const data = rows
          .filter((row,) => memoryVisibleTo(row, userId,))
          .map((row,) => toMemorySummary(row,));

        return { ok: true, status: 200, json: { data, total: data.length, }, };
      },
    },
    {
      name: "memory.get",
      domain: "memory",
      summary: "Fetch one memory's text",
      description: "The memory's character must belong to the calling user, and the repo's privacy " +
        "model must admit the caller — a private or secret memory is a 404, never its text.",
      scope: "read",
      ratePolicy: chatPolicy,
      bodySchema: MemoryGetBody,
      annotations: READ_ONLY_ANNOTATIONS,
      outputSchema: MemoryDetailOutputSchema,
      handler: async (ctx: FacadeContext, body: unknown,): Promise<FacadeResult> => {
        if (!Value.Check(MemoryGetBody, body,)) { return badBodyResult("memory.get",); }
        const parsed = body as Static<typeof MemoryGetBody>;
        const { userId, } = callerIdentity(ctx,);

        const row = await database
          .selectFrom("actor_memories",)
          .selectAll()
          .where("id", "=", parsed.memoryId,)
          .where("review_status", "=", "committed",)
          .executeTakeFirst();

        if (!row) { return notFoundResult("memory not found",); }

        const owned = await callerOwnsActor({ database, actorId: row.actor_id, userId, },);
        if (!owned) { return notFoundResult("memory not found",); }

        if (!memoryVisibleTo(row, userId,)) { return notFoundResult("memory not found",); }

        return {
          ok: true,
          status: 200,
          json: { ...toMemorySummary(row,), content: row.content, },
        };
      },
    },
  ];

  for (const op of ops) {
    const registered = registry.register(op,);
    if (!registered.ok) {
      throw new Error(registered.message,);
    }
  }
}
