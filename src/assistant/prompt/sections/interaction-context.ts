// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { getRecentInteractions, } from "../../../rpg/interaction";
import { jsonStringifyOr, } from "../../../utils";
import type { SectionBuilder, } from "../types";

export const interactionContextSection: SectionBuilder = {
  name: "interactionContext",
  enabled: () => true,
  build: async ({ db, chat, },) => {
    const interactions = await getRecentInteractions(db, { chatId: chat.id, limit: 10, },);
    if (interactions.length === 0) { return []; }
    const lines = interactions.map((interaction,) => {
      const changes = Object.keys(interaction.stateChanges,).length > 0
        ? `; changes ${jsonStringifyOr(interaction.stateChanges,)}`
        : "";
      const modifiers = interaction.modifiers.length === 0
        ? "none"
        : interaction.modifiers.map((modifier,) =>
          `${modifier.source} ${modifier.value >= 0 ? "+" : ""}${modifier.value}`
        ).join(", ",);
      return `- /${interaction.command}: ${interaction.outcome} (${
        interaction.rollTotal ?? "blocked"
      } vs DC ${interaction.difficulty}; advantage ${interaction.advantage}; modifiers ${modifiers})${changes}`;
    },);
    return [{
      role: "user",
      content: `[Recent game interactions]\n${lines.join("\n",)}`,
    },];
  },
};
