import type { InviteStatus, } from "../../db/enums";

/** Error codes surfaced by the invites service. */
export type InviteErrorCode =
  | "not_found"
  | "forbidden"
  | "expired"
  | "revoked"
  | "used_up"
  | "conflict"
  | "bad_request";

export interface InviteError {
  code: InviteErrorCode;
  message: string;
}

export type InviteResult<T,> = { ok: true; value: T } | { ok: false; error: InviteError };

export interface ChatInviteRow {
  id: string;
  chatId: string;
  code: string;
  createdBy: string | null;
  createdAt: string;
  expiresAt: string | null;
  maxUses: number | null;
  uses: number;
  status: InviteStatus;
}

export interface CreateInviteInput {
  chatId: string;
  createdBy: string;
  /** ISO timestamp — invite becomes invalid after this point. */
  expiresAt?: string | null;
  /** Maximum number of redemptions (null = unlimited). */
  maxUses?: number | null;
}

export type RedeemOutcome =
  | { ok: true; chatId: string; alreadyMember: boolean }
  | { ok: false; error: InviteError };
