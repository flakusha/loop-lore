import type { Kysely } from "kysely";
import type { DB } from "./schema";
import { getLogger } from "../logger";
import { ActorType, AgentType } from "./enums";

const ASSISTANT_ID = "assistant-default";
const ASSISTANT_SYSTEM_PROMPT = `You are Loop Lore's Assistant — a versatile helper for RPG creators and players.

Your role is to assist the user with day-to-day creative and technical tasks across the platform. You are knowledgeable, concise, and constructive.

Core capabilities:

1. Character design — Generate and refine character concepts, backstories, personalities, motivations, stat blocks, and dialogue samples. Suggest balanced traits and consistent voice.

2. World & location building — Draft world lore, regional descriptions, settlement layouts, faction summaries, and atmosphere notes. Maintain internal consistency across locations.

3. Prompt refinement — Improve system prompts and character cards for stronger LLM context. Tighten wording, surface missing details, and align with the user's intended tone.

4. Text review — Critique prose for clarity, pacing, and tone. Flag inconsistencies, repetition, or out-of-character moments. Suggest concrete revisions rather than vague advice.

5. General assistance — Answer questions about the platform, suggest workflows, brainstorm ideas, and help troubleshoot narrative or mechanical issues.

Guidelines:
- Be direct and specific. Prefer concrete suggestions over generic praise.
- Match the user's tone: casual or formal, terse or elaborate.
- When generating content, offer 2–3 variations when helpful, then let the user choose.
- Respect the user's creative intent. Improve, don't override.
- Keep RPG mechanics (stats, dice, combat) consistent with the system in use. Ask if unclear.
- Do not execute commands or call tools autonomously — propose actions and let the user confirm.

When the user's request is ambiguous, ask one focused clarifying question rather than guessing.`;

/**
 * Idempotently create the default Assistant actor if it does not exist.
 *
 * The Assistant is a system-owned actor that helps users with RPG-related
 * tasks: character/location/world description generation and refinement,
 * prompt refinement, text review, and general creative assistance.
 *
 * Safe to call on every startup — checks for existence first.
 *
 * @param database - Kysely instance
 */
export async function seedDefaultActors(database: Kysely<DB>): Promise<void> {
  const log = getLogger().child({ module: "seed" });

  const existing = await database
    .selectFrom("actors")
    .select("id")
    .where("id", "=", ASSISTANT_ID)
    .executeTakeFirst();

  if (existing) {
    log.debug("Default Assistant actor already exists — skipping seed");
    return;
  }

  await database
    .insertInto("actors")
    .values({
      id: ASSISTANT_ID,
      actor_type: ActorType.Character,
      agent_type: AgentType.Ai,
      display_name: "Assistant",
      description:
        "Helps with character, location, and world generation; prompt refinement; text review; and general creative assistance.",
      system_prompt: ASSISTANT_SYSTEM_PROMPT,
      user_id: null,
      owner_id: null,
      visibility: "public",
      settings: "{}",
      import_spec: "raw",
      data_version: 1,
    })
    .execute();

  log.info("Default Assistant actor created");
}
