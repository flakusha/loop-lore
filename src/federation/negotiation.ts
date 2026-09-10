// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/federation/negotiation.ts — session negotiation state machine.
//
// Linear handshake (idle → handshake → capability-exchange →
// quota-agreement → established); any open state may jump to closed, and
// closed is terminal. Illegal transitions throw and leave the row
// untouched. Metadata/control plane only — plaintext content never
// touches these paths.

import type { Kysely, } from "kysely";
import { sql, } from "kysely";
import type { DB, } from "../db/schema";

/** Negotiation states (linear handshake, closed terminal). */
export const NEGOTIATION_STATES = [
  "idle",
  "handshake",
  "capability-exchange",
  "quota-agreement",
  "established",
  "closed",
] as const;
/** Negotiation state. */
export type NegotiationState = (typeof NEGOTIATION_STATES)[number];

/** Forward chain; any state may jump to closed. */
const NEXT: Record<Exclude<NegotiationState, "closed">, NegotiationState> = {
  "idle": "handshake",
  "handshake": "capability-exchange",
  "capability-exchange": "quota-agreement",
  "quota-agreement": "established",
  "established": "established",
};

/**
 * Open a negotiation with a known peer.
 * @param database
 * @param peerOrigin
 * @returns Negotiation id.
 */
export async function beginNegotiation(
  database: Kysely<DB>,
  peerOrigin: string,
): Promise<string> {
  const peer = await database
    .selectFrom("mesh_peers",)
    .select("origin",)
    .where("origin", "=", peerOrigin,)
    .executeTakeFirst();
  if (!peer) { throw new Error(`unknown peer: ${peerOrigin}`,); }
  const id = crypto.randomUUID();
  await database
    .insertInto("mesh_negotiations",)
    .values({ id, peer_origin: peerOrigin, state: "idle", },)
    .execute();
  return id;
}

/**
 * Advance a negotiation one step. Only the forward transition or close is
 * legal; anything else throws and leaves the row untouched.
 * @param database
 * @param id
 * @param next
 */
export async function advanceNegotiation(
  database: Kysely<DB>,
  id: string,
  next: NegotiationState,
): Promise<void> {
  const row = await database
    .selectFrom("mesh_negotiations",)
    .select(["state",],)
    .where("id", "=", id,)
    .executeTakeFirst();
  if (!row) { throw new Error(`unknown negotiation: ${id}`,); }
  const current = row.state as NegotiationState;
  const legal = next === "closed" || (current !== "closed" && NEXT[current] === next);
  if (!legal) {
    throw new Error(`illegal negotiation transition: ${current} -> ${next}`,);
  }
  await database
    .updateTable("mesh_negotiations",)
    .set({ state: next, updated_at: sql`(datetime('now'))`, },)
    .where("id", "=", id,)
    .execute();
}
