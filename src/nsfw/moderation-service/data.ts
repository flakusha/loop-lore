// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW Moderation Service — user data
 *
 * Exporting and deleting a user's moderation-related data (GDPR support).
 */
import { jsonStringifyOr, } from "../../utils/safe-json";
import { mapFlag, } from "./flags";
import type { ContentFlag, ModAction, NsfwModerationServiceContext, NsfwUserPrefs, } from "./types";

export interface ExportUserDataArgs {
  thisL: NsfwModerationServiceContext;
  userId: string;
  /** Admin userId performing the export; recorded in log_entries for accountability. */
  exportedBy: string;
  /** Optional client IP; recorded in log_entries meta for forensics. */
  clientIp?: string | null;
}

/**
 * Maximum preview length for free-text fields (`description`,
 * `reason`) in the default export bundle. Full fields require an
 * elevated secondary request.
 */
export const EXPORT_PREVIEW_MAX = 200;

/** Truncate a free-text field to a length-capped preview. */
export function previewText(value: string | null | undefined,): string {
  if (typeof value !== "string" || value.length === 0) { return ""; }
  return value.length > EXPORT_PREVIEW_MAX
    ? value.slice(0, EXPORT_PREVIEW_MAX,) + "…"
    : value;
}

/**
 * Export all moderation data for a user (prefs, actions, flags).
 *
 * Security posture (BUG-nsfw-export-bundle-no-access-log):
 *   - Emits a `log_entries` access-log row BEFORE serving the bundle.
 *   - Free-text fields (`description`, `reason`) are replaced with
 *     length-capped previews in the default bundle. Full fields
 *     require an elevated secondary request (see
 *     `exportUserDataFull`).
 */
export async function exportUserData(
  { thisL, userId, exportedBy, clientIp, }: ExportUserDataArgs,
): Promise<{ preferences: NsfwUserPrefs | null; actions: ModAction[]; flags: ContentFlag[] }> {
  const now = new Date().toISOString();
  // Emit the access-log row FIRST so even a downstream failure is
  // recorded. GDPR exports are subject to retention/audit policy.
  await thisL.db.insertInto("log_entries",).values({
    id: crypto.randomUUID(),
    level: 30,
    timestamp: Date.now() / 1000,
    time: now,
    message: "NSFW moderation user-data export (audit log)",
    module: "nsfw-moderation",
    user_id: exportedBy,
    session_id: null,
    request_id: null,
    meta: jsonStringifyOr({
      action: "export-user-data",
      targetUserId: userId,
      exportedBy,
      clientIp: clientIp ?? null,
    },),
    event_type: "moderation",
    entity_type: "user",
    entity_id: userId,
    action: "export-user-data",
    created_at: now,
  },).execute();

  const [preferences, actions,] = await Promise.allSettled([
    thisL.getPreferences(userId,),
    thisL.getAuditLog(userId,),
  ],);
  const flagRows = await thisL.db.selectFrom("content_flags",).where("reporter_id", "=", userId,).orderBy(
    "created_at",
    "desc",
  ).selectAll().execute();
  const flags = Array.from(flagRows, (r,) => mapFlag(r,),).map((f,) => ({
    ...f,
    description: previewText(f.description ?? null,),
  }));
  const sanitizedActions = (actions.status === "fulfilled" ? actions.value : []).map((a,) => ({
    ...a,
    reason: previewText(a.reason,),
  }));
  return {
    preferences: preferences.status === "fulfilled" ? preferences.value : null as NsfwUserPrefs | null,
    actions: sanitizedActions,
    flags,
  };
}

export interface DeleteUserDataArgs {
  thisL: NsfwModerationServiceContext;
  userId: string;
  /** Admin userId performing the deletion; recorded in moderation_actions.deleted_by and log_entries.user_id for accountability. */
  deletedBy: string;
}

/** Delete all moderation data for a user, preserving the audit log. */
export async function deleteUserData(
  { thisL, userId, deletedBy, }: DeleteUserDataArgs,
): Promise<void> {
  const now = new Date().toISOString();
  // Soft-delete moderation_actions: preserves the audit log for forensics
  // and regulatory retention. GDPR subjects the user-owned `nsfw_user_preferences`
  // row to erasure; `moderation_actions` is an org-level security record.
  await thisL.db.updateTable("moderation_actions",)
    .set({ deleted_at: now, deleted_by: deletedBy, },)
    .where("target_user_id", "=", userId,)
    .where("deleted_at", "is", null,)
    .execute();
  // Hard-delete user-owned rows: NSFW preferences + reporter's own flags.
  await thisL.db.deleteFrom("content_flags",).where("reporter_id", "=", userId,).execute();
  await thisL.db.deleteFrom("nsfw_user_preferences",).where("user_id", "=", userId,).execute();
  // Audit trail of the destructive operation itself.
  await thisL.db.insertInto("log_entries",).values({
    id: crypto.randomUUID(),
    level: 30,
    timestamp: Date.now() / 1000,
    time: now,
    message: "NSFW moderation user-data deletion (audit-preserving)",
    module: "nsfw-moderation",
    user_id: deletedBy,
    session_id: null,
    request_id: null,
    meta: jsonStringifyOr({
      tablesAffected: ["moderation_actions", "content_flags", "nsfw_user_preferences",],
      targetUserId: userId,
      deletedBy,
    },),
    event_type: "moderation",
    entity_type: "user",
    entity_id: userId,
    action: "delete-user-data",
    created_at: now,
  },).execute();
  thisL.log.warn("Moderation data deleted (audit preserved) for user", { userId, deletedBy, },);
}
