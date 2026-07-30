import type { Kysely, } from "kysely";
import type { Config, } from "../config/schema";
import { getLogger, type Logger, } from "../logger";
import { ASSISTANT_SYSTEM_PROMPT, } from "../prompts";
import { uid, } from "../utils";
import { ActorType, AgentType, UserRole, UserStatus, } from "./enums";
import type { DB, } from "./schema";

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
export async function seedDefaultActors(database: Kysely<DB>, config?: Config,): Promise<void> {
  const log = getLogger().child({ module: "seed", },);

  // Seed default Assistant actor
  const existingActor = await database
    .selectFrom("actors",)
    .select("id",)
    .where("id", "=", ASSISTANT_ID,)
    .executeTakeFirst();

  if (existingActor) {
    log.debug("Default Assistant actor already exists — skipping seed",);
  } else {
    await database
      .insertInto("actors",)
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
        data_source_format: "json",
        data_raw: null,
        format_version: 0,
      },)
      .execute();

    log.info("Default Assistant actor created",);
  }

  // Mode split: solo/demo mode seeds a demo solo user (admin-equivalent);
  // multi-user mode bootstraps a real admin from config/env when none exists.
  const soloMode = !config?.auth.required;

  if (soloMode) {
    // Seed demo solo user (creates if no admin or solo user exists) — for demo mode admin access
    const hasAdmin = await database
      .selectFrom("users",)
      .select("id",)
      .where((eb,) => eb.or([eb("role", "=", UserRole.Admin,), eb("role", "=", UserRole.Solo,),],))
      .executeTakeFirst();

    if (!hasAdmin) {
      const soloId = uid();
      await database
        .insertInto("users",)
        .values({
          id: soloId,
          username: config?.auth.demoUsername ?? "demo",
          display_name: "Demo User",
          role: UserRole.Solo,
          status: UserStatus.Active,
          settings: "{}",
        },)
        .execute();
      log.info("Demo solo user created (admin-equivalent in solo mode)",);
    }
  } else {
    await seedBootstrapAdmin(database, config, log,);
  }
}

/**
 * Create the first admin in multi-user mode from config/env credentials.
 *
 * Idempotent: skipped if any `UserRole.Admin` row already exists. When
 * `auth.required` is true but no admin username/password is configured, logs a
 * warning — without them the instance has no way to create its first admin
 * (registration never grants admin).
 *
 * @param database - Kysely instance
 * @param config - Resolved config (auth.adminUsername / auth.adminPassword or env overrides)
 * @param log - Logger child
 */
async function seedBootstrapAdmin(database: Kysely<DB>, config: Config, log: Logger,): Promise<void> {
  const existingAdmin = await database
    .selectFrom("users",)
    .select("id",)
    .where("role", "=", UserRole.Admin,)
    .executeTakeFirst();

  if (existingAdmin) {
    log.debug("Admin user already exists — skipping bootstrap",);
    return;
  }

  const username = config.auth.adminUsername?.trim();
  const password = config.auth.adminPassword;
  if (!username || !password) {
    log.warn(
      "auth.required=true but no bootstrap admin configured (auth.adminUsername / auth.adminPassword " +
        "or AUTH_ADMIN_USERNAME / AUTH_ADMIN_PASSWORD). Instance has no admin — set credentials or enable registration.",
    );
    return;
  }

  const adminId = uid();
  try {
    await database
      .insertInto("users",)
      .values({
        id: adminId,
        username,
        display_name: username,
        password_hash: await Bun.password.hash(password,),
        role: UserRole.Admin,
        status: UserStatus.Active,
        settings: "{}",
      },)
      .execute();

    // Actor row so the admin can own chats/entities (chat_participants.actor_id → actors.id)
    await database
      .insertInto("actors",)
      .values({
        id: adminId,
        actor_type: "user",
        display_name: username,
        user_id: adminId,
        owner_id: adminId,
        agent_type: "none",
        settings: "{}",
        import_spec: "raw",
        data_source_format: "json",
        data_raw: null,
        format_version: 0,
      },)
      .execute();

    log.info(`Bootstrap admin "${username}" created`,);
  } catch (error) {
    // Race: another process created the admin concurrently, or username taken.
    log.debug("Bootstrap admin creation skipped or failed (race/duplicate)", { error: String(error,), },);
  }
}
