// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Split / reunite consequences for VN choice cards.
 *
 * Split out of choice-cards.ts for the per-file size gate. Everything here is
 * a pure consequence parser or a single best-effort endpoint call, so the
 * caller keeps ownership of the card list and the render.
 */
import { jsonBody, } from "../alpine/json";
import { feFetch, } from "../fe-fetch";

/**
 * Detect a split consequence: { action: "split", branches: [...] }
 * @param consequences
 * @returns the split branches array when valid, or null when not a split consequence.
 */
export function extractSplitBranches(
  consequences: Record<string, unknown>,
): { locationId: string; actorIds: string[] }[] | null {
  const action = consequences.action;
  const branches = consequences.branches;
  if (action !== "split" || !Array.isArray(branches,)) { return null; }
  const out: { locationId: string; actorIds: string[] }[] = [];
  for (const b of branches) {
    if (!b || typeof b !== "object") { continue; }
    const rec = b as Record<string, unknown>;
    const locationId = rec.locationId;
    const actorIds = rec.actorIds;
    if (typeof locationId !== "string" || !Array.isArray(actorIds,)) { continue; }
    const ids: string[] = [];
    for (const id of actorIds) {
      if (typeof id === "string") { ids.push(id,); }
    }

    if (ids.length === 0) { continue; }
    out.push({ locationId, actorIds: ids, },);
  }

  return out.length >= 2 ? out : null;
}

/**
 * Detect a reunion consequence: { action: "reunite", secondaryChatId }
 * @param consequences
 * @returns the secondary chat id when valid, or null when not a reunion consequence.
 */
export function extractReunionSource(consequences: Record<string, unknown>,): string | null {
  if (consequences.action !== "reunite") { return null; }
  const id = consequences.secondaryChatId;
  return typeof id === "string" ? id : null;
}

/**
 * POST /split for a split consequence. Best-effort: a failure leaves the
 * choice itself persisted and merely reports the consequence as not triggered.
 * @param chatId
 * @param branches
 * @returns true when the server accepted the split, false on network failure.
 */
export async function triggerSplit(
  chatId: string,
  branches: { locationId: string; actorIds: string[] }[],
): Promise<boolean> {
  try {
    const res = await feFetch(`/api/v1/chats/${chatId}/split`, {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: jsonBody({ branches, },),
    },);

    return res.ok;
  } catch {
    return false;
  }
}

/**
 * POST /reunite for a reunion consequence. Best-effort, same contract as
 * {@link triggerSplit}.
 * @param chatId
 * @param secondaryChatId
 * @returns true when the server accepted the reunion, false on network failure.
 */
export async function triggerReunite(chatId: string, secondaryChatId: string,): Promise<boolean> {
  try {
    const res = await feFetch(`/api/v1/chats/${chatId}/reunite`, {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: jsonBody({ secondaryChatId, },),
    },);

    return res.ok;
  } catch {
    return false;
  }
}
