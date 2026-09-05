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
import { getLogger, } from "../../../logger";
import { selectWithinBudget, } from "../../../memory/budget";
import { semanticRecall, } from "../../../memory/embeddings";
import {
  DEFAULT_COMFORT,
  DEFAULT_INJECTION_CONFIG,
  type InjectionContext,
  selectMemoriesForInjection,
} from "../../../memory/injection";
import { provisionMemories, } from "../../../memory/provision";
import type { MemoryEntry, } from "../../../memory/types";
import { wrapSection, } from "../../xml-utils";
import type { SectionBuilder, } from "../types";
import { buildProvisionContext, fetchActorMemories, } from "./memories-helpers";

export const memorySection: SectionBuilder = {
  name: "memories",
  enabled: () => true,
  build: async (ctx,) => {
    const baseCtx = await buildProvisionContext(
      ctx.db,
      ctx.actor.id,
      ctx.chat.id,
      ctx.chat.world_id,
    );
    const participantIds = baseCtx.participantIds;

    const OTHER_MEMORY_CAP = 5;

    const otherParticipants: string[] = [];
    for (const p of participantIds) { if (p !== ctx.actor.id) { otherParticipants.push(p,); } }
    const ownerSources = [ctx.actor.id, ...otherParticipants,];
    const provisionTasks = Array.from(ownerSources, async (ownerId,) => {
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
      const result = provisionMemories(rows, provisionCtx, Number.MAX_SAFE_INTEGER,);
      return result.accepted;
    },);

    const provisionResults = await Promise.allSettled(provisionTasks,);
    const provisioned: MemoryEntry[][] = [];
    for (const r of provisionResults) {
      if (r.status === "rejected") { throw r.reason; }
      provisioned.push(r.value,);
    }
    const allAccepted: MemoryEntry[] = [];
    for (const list of provisioned) { for (const m of list) { allAccepted.push(m,); } }
    if (allAccepted.length === 0) { return []; }

    // ── Phase 1b: Semantic re-ranking ─────────────────────────────────────
    // If Ollama is reachable, use cosine similarity to re-rank non-pinned
    // memories against the last 5 messages.  Pinned memories are excluded
    // from re-ranking (they always stay at the top).
    const pinned = allAccepted.filter((m,) => m.pinned);
    const mutable = allAccepted.filter((m,) => !m.pinned);
    if (mutable.length > 0) {
      try {
        const recent = await ctx.db
          .selectFrom("messages",)
          .select("content",)
          .where("chat_id", "=", ctx.chat.id,)
          .orderBy("created_at", "desc",)
          .limit(5,)
          .execute();
        if (recent.length > 0) {
          const queryText = recent.map((r,) => r.content ?? "").join(" ",);
          const matched = await semanticRecall(
            ctx.db,
            mutable.map((m,) => m.id),
            queryText,
            mutable.length,
            0.3,
          );
          if (matched.length > 0) {
            const scoreMap = new Map(matched.map((m,) => [m.memoryId, m.score,]),);
            mutable.sort((a, b,) => {
              const sa = scoreMap.get(a.id,) ?? 0;
              const sb = scoreMap.get(b.id,) ?? 0;
              if (sa !== sb) { return sb - sa; }
              return b.importance - a.importance;
            },);
          }
        }
      } catch (err) {
        // Graceful degradation: if semantic recall fails (e.g. Ollama/embed
        // provider down), keep the keyword-ranked order and continue. The
        // token-budget + injection-filter phases below still run.
        getLogger().warn(
          "memory section: semantic re-rank skipped (provider unavailable)",
          {
            err: err instanceof Error ? err.message : String(err,),
            chatId: ctx.chat.id,
          },
        );
      }
    }
    const ranked = [...pinned, ...mutable,];

    // ── Phase 2: Token budget ──────────────────────────────────────────────
    const budgeted = selectWithinBudget(ranked, { maxTokens: 1024, respectPins: true, },);
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
      .map((m,) => `- [${m.memoryType}] ${m.content}`)
      .join("\n",);

    return [{ role: "system", content: wrapSection("memory_context", memoryText,), },];
  },
};
