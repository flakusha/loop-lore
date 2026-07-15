/**
 * Story context section — current location and its state (time / weather /
 * atmosphere), only for story-mode chats.
 */
import type { SectionBuilder } from "../types";

export const storyContextSection: SectionBuilder = {
  name: "storyContext",
  enabled: (ctx) => ctx.isStory,
  build: async (ctx) => {
    const chat = ctx.chat;
    if (!chat.world_id) return [];

    const parts: string[] = ["[Story Context]"];

    if (chat.current_location_id) {
      const location = await ctx.db
        .selectFrom("locations")
        .select(["name", "description"])
        .where("id", "=", chat.current_location_id)
        .executeTakeFirst();
      if (location) {
        parts.push(`\nCurrent location: ${location.name}`);
        if (location.description) parts.push(`\n${location.description}`);
      }

      const locationState = await ctx.db
        .selectFrom("location_states")
        .select(["atmosphere", "npcs_present", "time_of_day", "weather"])
        .where("location_id", "=", chat.current_location_id)
        .executeTakeFirst();
      if (locationState) {
        if (locationState.time_of_day) parts.push(`\nTime: ${locationState.time_of_day}`);
        if (locationState.weather) parts.push(`\nWeather: ${locationState.weather}`);
        if (locationState.atmosphere) parts.push(`\nAtmosphere: ${locationState.atmosphere}`);
      }
    }

    return parts.length > 1 ? [{ role: "system", content: parts.join("") }] : [];
  },
};
