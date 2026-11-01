// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * E2E session row mapping.
 *
 * DB-row mapping split from `e2e-session.ts` to keep it under the
 * file-size guard. Mapping is byte-identical.
 */

/** */
export interface E2eSessionRow {
  id: string;
  senderActorId: string;
  recipientActorId: string | null;
  chatId: string | null;
  kind: "pair" | "group";
  createdAt: string;
  lastMessageAt: string | null;
  revokedAt: string | null;
}

// ── Row mapping ─────────────────────────────────────────────

export interface E2eSessionsDbRow {
  id: string;
  sender_actor_id: string;
  recipient_actor_id: string | null;
  chat_id: string | null;
  kind: "pair" | "group";
  created_at: string;
  last_message_at: string | null;
  revoked_at: string | null;
}

/**
 * @param row - raw `e2e_sessions` row from SQLite
 * @returns the row mapped to the camelCase `E2eSessionRow` shape.
 */
export function rowToSession(row: E2eSessionsDbRow,): E2eSessionRow {
  return {
    id: row.id,
    senderActorId: row.sender_actor_id,
    recipientActorId: row.recipient_actor_id,
    chatId: row.chat_id,
    kind: row.kind,
    createdAt: row.created_at,
    lastMessageAt: row.last_message_at,
    revokedAt: row.revoked_at,
  };
}
