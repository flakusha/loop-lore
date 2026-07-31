/**
 * DB Schema — GM Domain Tables
 *
 * Shadow notes (hidden narrative influence) and
 * whitenotes (visible narrative directives).
 */
import type { Generated, } from "kysely";
import type { ShadowNoteType, WhiteneoteScope, WhiteneoteType, } from "./enums-gm";

// ── Shadow Notes ──────────────────────────────────────────

/** Hidden narrative influence tracked by the GM. */
export interface ShadowNotes {
  id: Generated<string>;
  chat_id: string;
  type: ShadowNoteType;
  content: string;
  revealed: number;
  created_at: Generated<string>;
}

// ── Whitenotes ────────────────────────────────────────────

/** Visible narrative directive for story direction. */
export interface Whitenotes {
  id: Generated<string>;
  chat_id: string;
  type: WhiteneoteType;
  content: string;
  priority: number;
  scope: WhiteneoteScope;
  expires_at: string | null;
  created_at: Generated<string>;
}
