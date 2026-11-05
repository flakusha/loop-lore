// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Profession detail selection for the Alpine panel.
 *
 * Split from `professions.ts` for the 250-line size ceiling; spread into
 * the panel mixin like the progression mirror.
 */
import { apiFetch, } from "./htmx";
import { t, } from "./i18n";
import { log as rootLog, } from "./logger";
import type { ChatState, } from "./types";

const log = rootLog.child({ module: "professions", },);

/** Select (or toggle off) a profession and load its specializations. */
export async function selectProfession(this: ChatState, id: string,): Promise<void> {
  if (this.selectedProfessionId === id) {
    this.selectedProfessionId = null;
    this.selectedProfessionSpecs = null;
    return;
  }

  this.selectedProfessionId = id;
  this.selectedProfessionSpecs = null;
  try {
    const res = await apiFetch(`/api/rpg/professions/${encodeURIComponent(id,)}`,);
    if (res.status === 404) {
      // Not visible (missing/not-owned) — drop the selection quietly.
      this.selectedProfessionId = null;
      return;
    }

    if (!res.ok) {
      this.professionsError = t("rpg.professions.loadFailed",);
      return;
    }

    const data = (await res.json()) as { specializations?: ChatState["selectedProfessionSpecs"] };
    this.selectedProfessionSpecs = Array.isArray(data.specializations,) ? data.specializations : [];
  } catch (error) {
    log.error("Failed to load profession details", error instanceof Error ? error : undefined,);
    this.professionsError = t("rpg.professions.loadFailed",);
  }
}
