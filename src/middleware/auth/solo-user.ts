/**
 * Solo user helpers — singleton demo/solo user resolution + caching.
 */
import type { Kysely, } from "kysely";
import { UserRole, UserStatus, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { uid, } from "../../utils";

// Per-DB-instance solo user cache — prevents cross-test-server corruption
// when multiple Bun.serve instances share the same process (BUG.2).
const soloUserCache = new Map<Kysely<DB>, { id: string } | null>();

/**
 * Get or create the singleton solo/demo user.
 * Cached in-memory after first lookup.
 * Exported for use in routes/auth.ts.
 */
export async function getOrCreateSoloUserForAuth(
  database: Kysely<DB>,
  demoUsername: string,
): Promise<{ id: string } | null> {
  const cached = soloUserCache.get(database,);
  if (cached !== undefined) { return cached; }

  // Resolve the solo/demo user id (pre-seeded, demo, or created on first run).
  const existing = await database
    .selectFrom("users",)
    .select(["id",],)
    .where("role", "=", UserRole.Solo,)
    .executeTakeFirst();

  let soloId: string;
  if (existing) {
    soloId = existing.id;
  } else {
    // Check demo user (seeded via src/db/seed.ts or config)
    const demoUser = await database
      .selectFrom("users",)
      .select(["id",],)
      .where("username", "=", demoUsername,)
      .executeTakeFirst();

    if (demoUser) {
      soloId = demoUser.id;
    } else {
      // Create solo user on first run
      soloId = uid();
      try {
        await database
          .insertInto("users",)
          .values({
            id: soloId,
            username: demoUsername,
            display_name: "Solo User",
            role: UserRole.Solo,
            status: UserStatus.Active,
            settings: "{}",
          },)
          .execute();
      } catch {
        /* race: another request may have created it — next lookup will find it */
      }
    }
  }

  // Ensure the solo user has a corresponding actor. chat_participants.actor_id
  // references actors.id, and chat creation inserts the owner as actor_id = userId,
  // so the actor MUST exist or chat creation fails with a FOREIGN KEY constraint.
  // This also covers users pre-seeded by src/db/seed.ts (which creates the user
  // but not its actor).
  try {
    const actorExists = await database
      .selectFrom("actors",)
      .select("id",)
      .where("id", "=", soloId,)
      .executeTakeFirst();
    if (!actorExists) {
      await database
        .insertInto("actors",)
        .values({
          id: soloId,
          actor_type: "user",
          display_name: "Solo User",
          user_id: soloId,
          owner_id: soloId,
          agent_type: "none",
          settings: "{}",
          import_spec: "raw",
          data_source_format: "json",
          data_raw: null,
          format_version: 0,
        },)
        .execute();
    }
  } catch {
    /* race-safe: actor may already exist */
  }

  const result = { id: soloId, };
  soloUserCache.set(database, result,);
  return result;
}

/**
 * Clear the cached solo user reference (for testing).
 */
export function resetSoloUserCache(): void {
  soloUserCache.clear();
}
