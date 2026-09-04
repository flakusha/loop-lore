// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Actor Growth Section — injects the character's arc + growth log state
 * into the prompt so the LLM plays a "character in motion" rather than a
 * static personality snapshot.
 *
 * See `.plan/epics/epic-character-growth.md`. Emits (D7):
 * - Current arc stage + author description
 * - Last 5 applied growth_log entries (most recent first)
 * - Growth-mode directive:
 *     - dynamic: encouragement to honor recorded evolution
 *     - static : explicit anti-drift directive
 *
 * The section is **never** dropped by the prompt-budget tier system —
 * growth state is behavior-critical for both modes (stability or
 * evolution). It returns `[]` only when no arc and no log exist.
 */
import { characterGrowthService, } from "../../../characters/services/growth-service";
import { wrapSection, } from "../../xml-utils";
import type { SectionBuilder, } from "../types";

const STATIC_DIRECTIVE = "This character is in static mode. They do not grow, change, or " +
  "evolve. Do not let them acquire skills, shift traits, or deepen " +
  "relationships without explicit player invocation. Maintain their " +
  "author-defined personality, voice, and behavior throughout.";

const DYNAMIC_DIRECTIVE = "This character grows through the story. Acquired skills, " +
  "drifted traits, and shifted bonds are recorded in their growth " +
  "log. Honor what has changed; do not revert to baseline.";

export const actorGrowthSection: SectionBuilder = {
  name: "actorGrowth",
  // Always enabled — build() returns [] when no growth state exists.
  enabled: () => true,
  build: async (ctx,) => {
    try {
      const svc = characterGrowthService(ctx.db,);
      const [mode, arc, log,] = await Promise.all([
        svc.getGrowthMode(ctx.actor.id,),
        svc.getArc(ctx.actor.id,),
        svc.listGrowthLog(ctx.actor.id, { limit: 5, includePending: false, },),
      ],);

      if (!arc && log.length === 0) {
        // No growth state yet — emit nothing rather than padding the
        // prompt with an empty section.
        return [];
      }

      const lines: string[] = [];

      if (arc) {
        lines.push(
          `Current arc stage: ${arc.currentStage}` +
            (arc.stageDescription ? ` — ${arc.stageDescription}` : ""),
        );
      }

      if (log.length > 0) {
        lines.push("Recent growth log (most recent first):",);
        for (const entry of log) {
          const subject = entry.subjectKind && entry.subjectId
            ? ` (${entry.subjectKind}:${entry.subjectId})`
            : "";
          lines.push(`- ${entry.recordedAt} [${entry.axis}/${entry.eventType}]${subject}: ${entry.reason}`,);
        }
      }

      const directive = mode.growthMode === "static" ? STATIC_DIRECTIVE : DYNAMIC_DIRECTIVE;
      lines.push("",);
      lines.push(directive,);

      return [
        {
          role: "system",
          content: wrapSection("growth", lines.join("\n",),),
        },
      ];
    } catch {
      // Tables may not exist in test DBs or before migration.
      return [];
    }
  },
};
