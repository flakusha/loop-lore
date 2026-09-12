// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Ownership transfer option/result envelopes.
 *
 * Kept in a separate file to keep ownership.ts ≤250L.
 */
import type { ServiceError, } from "./types";

/** Input for an ownership-transfer request. */
export interface TransferOwnershipOptions {
  chatId: string;
  requesterId: string;
  requesterRole: string | null | undefined;
  newOwnerId: string;
  reason?: string;
}

/** Result payload on a successful transfer. */
export interface TransferOwnershipResult {
  newOwnerId: string;
  previousOwnerId: string;
  autoInvited: boolean;
}

/** Outcome envelope — success carries the result; failure carries a ServiceError. */
export type TransferOwnershipOutcome =
  | { ok: true; result: TransferOwnershipResult }
  | { ok: false; error: ServiceError };
