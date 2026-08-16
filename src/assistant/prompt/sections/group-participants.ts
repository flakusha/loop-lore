// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Group participants section — character cards for the other actors in a
 * group chat, so the generating actor knows who it is talking to.
 */
import type { SectionBuilder, } from "../types";

export const groupParticipantsSection: SectionBuilder = {
  name: "groupParticipants",
  enabled: (ctx,) => !!(ctx.params.groupParticipantIds && ctx.params.groupParticipantIds.length > 0),
  build: async (ctx,) => {
    const others = await ctx.db
      .selectFrom("actors",)
      .select(["id", "display_name", "description", "personality",],)
      .where("id", "in", ctx.params.groupParticipantIds ?? [],)
      .execute();

    if (others.length === 0) { return []; }

    const parts: string[] = ["[Other Participants]",];
    for (const other of others) {
      const card: string[] = [];
      if (other.display_name) { card.push(other.display_name,); }
      if (other.description) { card.push(`— ${other.description}`,); }
      if (other.personality) { card.push(`(${other.personality})`,); }
      if (card.length > 0) { parts.push(`\n- ${card.join(" ",)}`,); }
    }

    return [{ role: "system", content: parts.join("",), },];
  },
};
