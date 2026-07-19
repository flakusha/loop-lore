/**
 * Story context section — current location and its state (time / weather /
 * atmosphere), only for story-mode chats.
 */
import { wrapSection } from "../../xml-utils";
import type { SectionBuilder } from "../types";

export const storyContextSection: SectionBuilder = {
  name: "storyContext",
  enabled: (ctx) => ctx.isStory,
  build: async (ctx) => {
    const chat = ctx.chat;
    if (!chat.world_id) return [];

    const parts: string[] = [];

    if (chat.current_location_id) {
      const location = await ctx.db
        .selectFrom("locations")
        .select(["name", "description"])
        .where("id", "=", chat.current_location_id)
        .executeTakeFirst();
      if (location) {
        parts.push(`Current location: ${location.name}`);
        if (location.description) parts.push(location.description);
      }

      const locationState = await ctx.db
        .selectFrom("location_states")
        .select(["atmosphere", "npcs_present", "time_of_day", "weather"])
        .where("location_id", "=", chat.current_location_id)
        .executeTakeFirst();
      if (locationState) {
        if (locationState.time_of_day) parts.push(`Time: ${locationState.time_of_day}`);
        if (locationState.weather) parts.push(`Weather: ${locationState.weather}`);
        if (locationState.atmosphere) parts.push(`Atmosphere: ${locationState.atmosphere}`);
      }
    }

    return parts.length > 0
      ? [{ role: "system", content: wrapSection("story_context", parts.join("\n")) }]
      : [];
  },
};
