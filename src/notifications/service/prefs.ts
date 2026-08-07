import type { Kysely, } from "kysely";
import type { NotificationType, } from "../../db/enums-core";
import type { DB, } from "../../db/schema";
import { jsonParseOr, safeJsonStringify, } from "../../utils";
import {
  DEFAULT_PREFS,
  type NotificationPreferences,
} from "./types";

function mergePrefs(stored?: Partial<NotificationPreferences>,): NotificationPreferences {
  const prefs: NotificationPreferences = {
    enabled: { ...DEFAULT_PREFS.enabled, },
    mutedWorlds: [...DEFAULT_PREFS.mutedWorlds,],
  };
  if (stored?.enabled) {
    for (const key of Object.keys(prefs.enabled,) as NotificationType[]) {
      const value = stored.enabled[key];
      if (typeof value === "boolean") { prefs.enabled[key] = value; }
    }
  }
  if (Array.isArray(stored?.mutedWorlds,)) {
    prefs.mutedWorlds = [...stored.mutedWorlds,];
  }
  return prefs;
}

/** Read the user's notification preferences, merging over defaults. */
export async function getPrefs(
  db: Kysely<DB>,
  userId: string,
): Promise<NotificationPreferences> {
  const user = await db
    .selectFrom("users",)
    .select("settings",)
    .where("id", "=", userId,)
    .executeTakeFirst();
  const settings = jsonParseOr(user?.settings ?? "{}", {},) as Record<string, unknown>;
  const stored = settings.notifications as Partial<NotificationPreferences> | undefined;
  return mergePrefs(stored,);
}

/** Merge and persist the user's notification preferences. */
export async function setPrefs(
  db: Kysely<DB>,
  userId: string,
  patch: { enabled?: Partial<Record<NotificationType, boolean>>; mutedWorlds?: string[] },
): Promise<NotificationPreferences> {
  const current = await getPrefs(db, userId,);
  const merged: NotificationPreferences = {
    enabled: { ...current.enabled, ...patch.enabled, },
    mutedWorlds: patch.mutedWorlds ?? current.mutedWorlds,
  };

  const user = await db
    .selectFrom("users",)
    .select("settings",)
    .where("id", "=", userId,)
    .executeTakeFirst();
  const settings = jsonParseOr(user?.settings ?? "{}", {},) as Record<string, unknown>;
  settings.notifications = merged;

  const serialized = safeJsonStringify(settings,);
  if (!serialized.ok) {
    // Don't report success for a preference we failed to persist.
    throw new Error("Failed to serialize notification preferences",);
  }
  await db
    .updateTable("users",)
    .set({ settings: serialized.value, },)
    .where("id", "=", userId,)
    .execute();
  return merged;
}
