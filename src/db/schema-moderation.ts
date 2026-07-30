/**
 * DB Schema — Moderation Tables
 *
 * NSFW gate settings, moderation flags, and audit log.
 */
import type { Generated, } from "kysely";

// ── NSFW User Preferences ──────────────────────────────────
/** Per-user NSFW toggle, block, ban, and shadow state. */
export interface NsfwUserPreferences {
  id: Generated<string>;
  user_id: string;
  nsfw_enabled: Generated<number>;
  max_rating: Generated<string>;
  blocked_from_nsfw: Generated<number>;
  banned_from_nsfw: Generated<number>;
  shadow_nsfw: Generated<number>;
  block_reason: string | null;
  banned_at: string | null;
  banned_by: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── Content Flags ───────────────────────────────────────────
/** User-submitted or system-generated content flags. */
export interface ContentFlags {
  id: Generated<string>;
  reporter_id: string;
  content_type: string;
  content_id: string;
  chat_id: string | null;
  world_id: string | null;
  flag_reason: string;
  description: string | null;
  status: Generated<string>;
  resolution: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: Generated<string>;
}

// ── Moderation Actions ──────────────────────────────────────
/** Immutable audit trail of moderation actions. */
export interface ModerationActions {
  id: Generated<string>;
  action_type: string;
  target_user_id: string;
  performed_by: string;
  reason: string;
  scope: string;
  scope_id: string | null;
  metadata: Generated<string>;
  expires_at: string | null;
  created_at: Generated<string>;
}
