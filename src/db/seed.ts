import type { Kysely } from "kysely";
import type { DB } from "./schema";
import { getLogger } from "../logger";
import { ActorType, AgentType, UserRole, UserStatus } from "./enums";
import { uid } from "../utils";
import { ASSISTANT_SYSTEM_PROMPT } from "../prompts";

const ASSISTANT_ID = "assistant-default";

/**
 * Idempotently create the default Assistant actor and demo solo user if they do not exist.
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

  // Seed default Assistant actor
  const existingActor = await database
    .selectFrom("actors")
    .select("id")
    .where("id", "=", ASSISTANT_ID)
    .executeTakeFirst();

  if (existingActor) {
    log.debug("Default Assistant actor already exists — skipping seed");
  } else {
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

  // Seed demo solo user (creates if no admin or solo user exists) — for demo mode admin access
  const hasAdmin = await database
    .selectFrom("users")
    .select("id")
    .where((eb) => eb.or([eb("role", "=", UserRole.Admin), eb("role", "=", UserRole.Solo)]))
    .executeTakeFirst();

  if (!hasAdmin) {
    const soloId = uid();
    await database
      .insertInto("users")
      .values({
        id: soloId,
        username: "demo",
        display_name: "Demo User",
        role: UserRole.Solo,
        status: UserStatus.Active,
        settings: "{}",
      })
      .execute();
    log.info("Demo solo user created (admin-equivalent in solo mode)");
  }
}
