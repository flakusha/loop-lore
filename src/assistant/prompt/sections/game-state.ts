// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Game state section — instructs the LLM to emit a fenced ```game-state
 * JSON block whenever the scene's spatial layout changes, and surfaces the
 * latest persisted snapshot (from `game_states`) as compact context.
 *
 * Absent state → renders the emission instruction only.
 */
import { jsonParseOr, } from "../../../utils/safe-json";
import { wrapSection, } from "../../xml-utils";
import type { SectionBuilder, } from "../types";

/** Shape of the JSON stored in `game_states.state` (best-effort parse). */
interface GameStatePayload {
  grid?: { w?: number; h?: number };
  entities?: Array<{
    id?: string;
    name?: string;
    kind?: string;
    x?: number;
    y?: number;
  }>;
  analysis?: string | null;
  caption?: string | null;
}

const INSTRUCTION = `# Game state emission
Whenever the scene's spatial layout changes (things move, appear, disappear, or the grid itself changes), emit the CURRENT full layout in a fenced \`\`\`game-state JSON block:

\`\`\`game-state
{"grid":{"w":10,"h":8},"entities":[{"id":"pc","name":"Aria","kind":"pc","x":2,"y":3},{"id":"gob1","name":"Goblin","kind":"enemy","x":7,"y":5}],"items":[{"id":"key","name":"Brass key","x":4,"y":1}],"caption":"Goblin blocks the east corridor"}
\`\`\`

Schema: \`grid\` is \`{w, h}\`; \`entities\` is a list of \`{id, name, kind, x, y}\` where kind is one of \`pc|npc|enemy|object\`; \`items\` and \`caption\` are optional. Emit the block at most once per reply, as the last content.`;

function summarize(state: GameStatePayload,): string[] {
  const parts: string[] = [];
  if (state.grid?.w != null && state.grid?.h != null) {
    parts.push(`Grid: ${state.grid.w}x${state.grid.h}.`,);
  }
  if (state.entities?.length) {
    const ents = state.entities
      .map((e,) => `${e.id ?? "?"} (${e.name ?? "?"}, ${e.kind ?? "object"}) at (${e.x ?? "?"},${e.y ?? "?"})`)
      .join("; ",);
    parts.push(`Entities: ${ents}.`,);
  }
  if (state.analysis) {
    parts.push(`Last analysis: ${state.analysis}`,);
  } else if (state.caption) {
    parts.push(`Caption: ${state.caption}`,);
  }
  return parts;
}

export const gameStateSection: SectionBuilder = {
  name: "gameState",
  enabled: () => true,

  build: async (ctx,) => {
    const row = await ctx.db
      .selectFrom("game_states",)
      .select(["state",],)
      .where("chat_id", "=", ctx.chat.id,)
      .orderBy("created_at", "desc",)
      .executeTakeFirst();

    if (!row) {
      return [{
        role: "system",
        content: wrapSection("game_state", INSTRUCTION,),
      },];
    }

    const payload = jsonParseOr<GameStatePayload>(row.state, {},);

    const parts = [INSTRUCTION, "Current tracked state:", ...summarize(payload,),];
    return [{
      role: "system",
      content: wrapSection("game_state", parts.join("\n",),),
    },];
  },
};
