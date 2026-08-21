// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Memory section — the actor's most important memories, provision-filtered
 * by scope, privacy, shareability, and token budget, then injection-filtered
 * by probability, comfort, and context relevance.
 *
 * Phase 1b: semantic re-ranking — if Ollama is reachable, memories are
 * re-ranked by cosine similarity against recent conversation context after
 * privacy/provision filtering but before injection filtering.
 */
import type { Kysely } from "kysely";
import { RelationshipsService } from "../../../characters/services/relationships-service";
import type { DB } from "../../../db/schema";
import { selectWithinBudget } from "../../../memory/budget";
import { semanticRecall } from "../../../memory/embeddings";
import {
  DEFAULT_COMFORT,
  DEFAULT_INJECTION_CONFIG,
  type InjectionContext,
  selectMemoriesForInjection,
} from "../../../memory/injection";
import { type ProvisionContext, provisionMemories } from "../../../memory/provision";
import type { MemoryEntry } from "../../../memory/types";
import { safeJsonParse } from "../../../utils";
import { wrapSection } from "../../xml-utils";
import type { SectionBuilder } from "../types";

/**
 * Compute the trust modifier for a viewer based on average trust
 * across all chat participants.
 */
async function computeTrustModifier(
  db: Kysely<DB>,
  viewerId: string,
  participantIds: string[],
  worldId: string | null,
): Promise<number> {
  if (participantIds.length === 0) { return 0; }

  const relationshipsService = RelationshipsService(db);
  let totalTrust = 0;
  let count = 0;

  for (const participantId of participantIds) {
    if (participantId === viewerId) { continue; }
    const rel = await relationshipsService.getRelationship(
      viewerId,
      participantId,
      worldId ?? undefined,
    );
    if (rel) {
      totalTrust += rel.trust;
      count++;
    }
  }

  if (count === 0) { return 0; }
  return Math.max(-1, Math.min(1, (totalTrust / count) / 100));
}

/**
 * Build a ProvisionContext from the prompt assembly context.
 */
async function buildProvisionContext(
  db: Kysely<DB>,
  actorId: string,
  chatId: string,
  worldId: string | null,
  ownerId: string = actorId,
): Promise<ProvisionContext> {
  const participants = await db
    .selectFrom("chat_participants")
    .select("actor_id")
    .where("chat_id", "=", chatId)
    .execute();

  const participantIds = Array.from(participants, (p) => p.actor_id);
  const trustModifier = await computeTrustModifier(db, actorId, participantIds, worldId);

  return {
    viewerId: actorId,
    ownerId,
    chatId,
    worldId,
    participantIds,
    trustModifier,
  };
}

/**
 * Fetch memories for the actor from the database.
 */
async function fetchActorMemories(
  db: Kysely<DB>,
  actorId: string,
  limit = 50,
): Promise<MemoryEntry[]> {
  const rows = await db
    .selectFrom("actor_memories")
    .selectAll()
    .where("actor_id", "=", actorId)
    .orderBy("importance", "desc")
    .limit(limit)
    .execute();

  return Array.from(rows, (r) => ({
    id: r.id,
    actorId: r.actor_id,
    userId: r.user_id ?? undefined,
    worldId: r.world_id ?? undefined,
    content: r.content,
    memoryType: r.memory_type,
    confidence: r.confidence,
    importance: r.importance,
    keywords: (() => {
      const parsed = safeJsonParse<string[]>(r.keywords ?? "[]");
      return parsed.ok ? parsed.value : [];
    })(),
    sourceChatId: r.source_chat_id ?? undefined,
    sourceMessageId: r.source_message_id ?? undefined,
    pinned: Boolean(r.pinned),
    scope: (r.scope ?? "character") as MemoryEntry["scope"],
    privacy: (r.privacy ?? "shared") as MemoryEntry["privacy"],
    shareability: r.shareability,
    expiresAt: r.expires_at ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export const memorySection: SectionBuilder = {
  name: "memories",
  enabled: () => true,
  build: async (ctx) => {
    const baseCtx = await buildProvisionContext(
      ctx.db,
      ctx.actor.id,
      ctx.chat.id,
      ctx.chat.world_id,
    );
    const participantIds = baseCtx.participantIds;

    const OTHER_MEMORY_CAP = 5;

    const otherParticipants: string[] = [];
    for (const p of participantIds) { if (p !== ctx.actor.id) { otherParticipants.push(p); } }
    const ownerSources = [ctx.actor.id, ...otherParticipants];
    const provisionTasks = Array.from(ownerSources, async (ownerId) => {
      const isSpeaker = ownerId === ctx.actor.id;
      const rows = await fetchActorMemories(
        ctx.db,
        ownerId,
        isSpeaker ? 50 : OTHER_MEMORY_CAP,
      );
      if (rows.length === 0) { return []; }
      const provisionCtx = await buildProvisionContext(
        ctx.db,
        ctx.actor.id,
        ctx.chat.id,
        ctx.chat.world_id,
        ownerId,
      );
      const result = provisionMemories(rows, provisionCtx, Number.MAX_SAFE_INTEGER);
      return result.accepted;
    });

    const provisionResults = await Promise.allSettled(provisionTasks);
    const provisioned: MemoryEntry[][] = [];
    for (const r of provisionResults) {
      if (r.status === "rejected") { throw r.reason; }
      provisioned.push(r.value);
    }
    const allAccepted: MemoryEntry[] = [];
    for (const list of provisioned) { for (const m of list) { allAccepted.push(m); } }
    if (allAccepted.length === 0) { return []; }

    // ── Phase 1b: Semantic re-ranking ─────────────────────────────────────
    // If Ollama is reachable, use cosine similarity to re-rank non-pinned
    // memories against the last 5 messages.  Pinned memories are excluded
    // from re-ranking (they always stay at the top).
    const pinned = allAccepted.filter((m) => m.pinned);
    const mutable = allAccepted.filter((m) => !m.pinned);
    if (mutable.length > 0) {
      const recent = await ctx.db
        .selectFrom("messages")
        .select("content")
        .where("chat_id", "=", ctx.chat.id)
        .orderBy("created_at", "desc")
        .limit(5)
        .execute();
      if (recent.length > 0) {
        const queryText = recent.map((r) => r.content ?? "").join(" ");
        const matched = await semanticRecall(
          ctx.db,
          mutable.map((m) => m.id),
          queryText,
          mutable.length,
          0.3,
        );
        if (matched.length > 0) {
          const scoreMap = new Map(matched.map((m) => [m.memoryId, m.score]));
          mutable.sort((a, b) => {
            const sa = scoreMap.get(a.id) ?? 0;
            const sb = scoreMap.get(b.id) ?? 0;
            if (sa !== sb) { return sb - sa; }
            return b.importance - a.importance;
          });
        }
      }
    }
    const ranked = [...pinned, ...mutable];

    // ── Phase 2: Token budget ──────────────────────────────────────────────
    const budgeted = selectWithinBudget(ranked, { maxTokens: 1024, respectPins: true });
    if (budgeted.length === 0) { return []; }

    // ── Phase 3: Injection filter ──────────────────────────────────────────
    const injectionCtx: InjectionContext = {
      chatId: ctx.chat.id,
      worldId: ctx.chat.world_id,
      locationId: ctx.chat.current_location_id,
      isPrivateChat: participantIds.length <= 2,
      participantCount: participantIds.length,
      turnNumber: 0,
      currentKeywords: [],
      averageIntimacy: 50,
      moodModifier: 0,
    };

    const injectionResult = selectMemoriesForInjection(
      budgeted,
      DEFAULT_INJECTION_CONFIG,
      injectionCtx,
      DEFAULT_COMFORT,
    );

    if (injectionResult.selected.length === 0) { return []; }

    const memoryText = injectionResult.selected
      .map((m) => `- [${m.memoryType}] ${m.content}`)
      .join("\n");

    return [{ role: "system", content: wrapSection("memory_context", memoryText) }];
  },
};
