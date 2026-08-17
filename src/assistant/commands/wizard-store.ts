// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Wizard session store — ephemeral in-memory draft storage for creation wizards.
 *
 * Drafts live for the duration of the server process. Each wizard session
 * holds the generated entity data, entity type, and metadata needed to
 * confirm (save) or cancel the creation.
 */

/** A single wizard draft session. */
export interface WizardDraft {
  /** Unique wizard session ID. */
  id: string;
  /** Entity type: character, location, world, item. */
  entityType: string;
  /** Original user description. */
  description: string;
  /** LLM-generated entity data (editable fields). */
  data: Record<string, string | undefined>;
  /** User ID who initiated the wizard. */
  userId: string;
  /** Chat ID where the wizard was started. */
  chatId: string;
  /** World ID context (for location/item). */
  worldId?: string;
  /** Creation timestamp (epoch ms). */
  createdAt: number;
}

/** In-memory wizard session store. */
const drafts = new Map<string, WizardDraft>();

/** Draft TTL: 30 minutes. */
const DRAFT_TTL_MS = 30 * 60 * 1000;

/** Maximum concurrent drafts per user. */
const MAX_DRAFTS_PER_USER = 5;

/**
 * Store a wizard draft.
 *
 * @returns The draft ID, or null if the user has too many active drafts
 */
export function storeWizardDraft(
  entityType: string,
  description: string,
  data: Record<string, string | undefined>,
  userId: string,
  chatId: string,
  worldId?: string,
): string | null {
  // Evict expired drafts first
  evictExpired();

  // Count user's active drafts
  let userDrafts = 0;
  for (const draft of drafts.values()) {
    if (draft.userId === userId) { userDrafts++; }
  }
  if (userDrafts >= MAX_DRAFTS_PER_USER) { return null; }

  const id = `wiz_${Date.now()}_${Math.random().toString(36,).slice(2, 8,)}`;
  drafts.set(id, {
    id,
    entityType,
    description,
    data,
    userId,
    chatId,
    worldId,
    createdAt: Date.now(),
  },);
  return id;
}

/**
 * Retrieve a wizard draft by ID.
 */
export function getWizardDraft(id: string,): WizardDraft | undefined {
  const draft = drafts.get(id,);
  if (!draft) { return undefined; }
  if (Date.now() - draft.createdAt > DRAFT_TTL_MS) {
    drafts.delete(id,);
    return undefined;
  }
  return draft;
}

/**
 * Update a wizard draft's data (after user edits).
 */
export function updateWizardDraft(
  id: string,
  data: Record<string, string | undefined>,
): boolean {
  const draft = getWizardDraft(id,);
  if (!draft) { return false; }
  draft.data = data;
  return true;
}

/**
 * Delete a wizard draft (on confirm or cancel).
 */
export function deleteWizardDraft(id: string,): boolean {
  return drafts.delete(id,);
}

/**
 * Evict expired drafts. Called automatically on store.
 */
function evictExpired(): void {
  const now = Date.now();
  for (const [key, draft,] of drafts) {
    if (now - draft.createdAt > DRAFT_TTL_MS) {
      drafts.delete(key,);
    }
  }
}
