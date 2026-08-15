import type { InviteStatus, } from "../../db/enums";
import type { InviteError, } from "../invites";

export interface WorldInviteRow {
  id: string;
  worldId: string;
  code: string;
  createdBy: string | null;
  createdAt: string;
  expiresAt: string | null;
  maxUses: number | null;
  uses: number;
  status: InviteStatus;
}

export interface CreateWorldInviteInput {
  worldId: string;
  createdBy: string;
  /** ISO timestamp — invite becomes invalid after this point. */
  expiresAt?: string | null;
  /** Maximum number of redemptions (null = unlimited). */
  maxUses?: number | null;
}

export type WorldRedeemOutcome =
  | { ok: true; worldId: string; alreadyMember: boolean }
  | { ok: false; error: InviteError };
