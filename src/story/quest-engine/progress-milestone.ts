// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/story/quest-engine/progress-milestone.ts — the narrative milestone a
// quest progress gain crosses. Split out of progress.ts to keep that module
// within the file size limit.

/** A narrative hook on a quest: a progress threshold and its text. */
export interface MilestoneHook {
  progress: number;
  narrative: string;
}

/**
 * Find the narrative milestone a progress change crosses.
 *
 * The narrative surfaces only when the change actually crossed a hook: a
 * change inside an already-reached band surfaces nothing.
 * @param hooks Quest narrative hooks.
 * @param previousProgress Progress before the change.
 * @param newProgress Progress after the change.
 * @returns The milestone narrative, or null when no milestone was crossed.
 */
export function computeMilestoneText(
  hooks: MilestoneHook[],
  previousProgress: number,
  newProgress: number,
): string | null {
  let oldMilestone: MilestoneHook | undefined;
  let newMilestone: MilestoneHook | undefined;
  for (const h of hooks) {
    if (h.progress <= previousProgress && (!oldMilestone || h.progress > oldMilestone.progress)) {
      oldMilestone = h;
    }

    if (
      h.progress <= newProgress &&
      h.progress > previousProgress &&
      (!newMilestone || h.progress > newMilestone.progress)
    ) {
      newMilestone = h;
    }
  }

  if (newMilestone && (!oldMilestone || oldMilestone.progress < newMilestone.progress)) {
    return newMilestone.narrative;
  }

  return null;
}
