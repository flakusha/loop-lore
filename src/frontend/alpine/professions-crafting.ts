// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Crafting-station profession bonus display (TASK-professions-frontend).
 *
 * Split from `professions.ts` for the 250-line size ceiling; spread into
 * the panel mixin like the selection helper. When a crafting station opens,
 * the station UI calls `loadStationProfession(actorId, discipline)` and
 * renders `stationProfessionBonus()` next to the station's own tier bonuses.
 * Bonus numbers come from the progression mirror
 * (`./professions-progression`), never reimplemented here.
 */
import { apiFetch, } from "./htmx";
import { log as rootLog, } from "./logger";
import { professionBonuses, } from "./professions-progression";
import type { ChatState, ProfessionView, } from "./types";

const log = rootLog.child({ module: "professions-crafting", },);

/**
 * One-line profession bonus summary for a crafting station, e.g.
 * "Your Smithing (Expert): +10% quality, +5% success".
 * @param profession the actor's matching-discipline profession
 * @returns the bonus line, or "" when the level grants no bonuses yet
 */
export function stationProfessionBonusLine(
  profession: Pick<ProfessionView, "discipline" | "level" | "title">,
): string {
  const bonuses = professionBonuses(profession.level,);
  const parts: string[] = [];
  if (bonuses.quality > 0) { parts.push(`+${Math.round(bonuses.quality * 100,)}% quality`,); }
  if (bonuses.success > 0) { parts.push(`+${Math.round(bonuses.success * 100,)}% success`,); }
  if (bonuses.speed > 0) { parts.push(`+${Math.round(bonuses.speed * 100,)}% speed`,); }
  if (bonuses.materialSaving > 0) { parts.push(`+${Math.round(bonuses.materialSaving * 100,)}% materials`,); }
  if (parts.length === 0) { return ""; }

  const name = profession.discipline.charAt(0,).toUpperCase() + profession.discipline.slice(1,);
  const title = profession.title.charAt(0,).toUpperCase() + profession.title.slice(1,);
  return `Your ${name} (${title}): ${parts.join(", ",)}`;
}

/**
 * Load the actor's profession for a recipe discipline, if any.
 *
 * Reuses the owner-scoped list route (`GET .../professions/actors/:actorId`);
 * 404/403 (not visible) resolve to null so a station renders without a
 * bonus line instead of an error.
 * @param actorId
 * @param discipline recipe discipline (e.g. "smithing")
 * @param worldId optional world scope, forwarded as `?worldId=`
 * @returns the matching profession, or null when none is visible
 */
export async function loadStationProfession(
  actorId: string,
  discipline: string,
  worldId?: string,
): Promise<ProfessionView | null> {
  try {
    // Literal `?` in the template (not hidden in `${query}`): the fe-be
    // harmony gate cuts the query at the first `?` before segment matching.
    const res = await apiFetch(
      `/api/rpg/professions/actors/${encodeURIComponent(actorId,)}${
        worldId ? `?worldId=${encodeURIComponent(worldId,)}` : ""
      }`,
    );

    if (!res.ok) { return null; }
    const data = await res.json() as { professions?: ProfessionView[] };
    const rows = Array.isArray(data.professions,) ? data.professions : [];
    return rows.find((p,) => p.discipline === discipline) ?? null;
  } catch (error) {
    log.error("Failed to load station profession", error instanceof Error ? error : undefined,);
    return null;
  }
}

/** Mixin slice: fetch the matching profession when a station opens. */
export const stationProfessions: Partial<ChatState> & ThisType<ChatState> = {
  stationProfession: null as unknown as ChatState["stationProfession"],
  stationProfessionLoading: false,

  stationProfessionBonus() {
    if (!this.stationProfession) { return ""; }
    return stationProfessionBonusLine(this.stationProfession,);
  },

  async loadStationProfession(actorId: string, discipline: string, worldId?: string,) {
    if (this.stationProfessionLoading) { return; }
    this.stationProfessionLoading = true;
    try {
      this.stationProfession = await loadStationProfession(actorId, discipline, worldId,);
    } finally {
      this.stationProfessionLoading = false;
    }
  },
};
