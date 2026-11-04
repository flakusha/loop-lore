// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Professions panel mixin (TASK-professions-frontend).
 *
 * Drives (server is the authz boundary; 404 == "not visible" — missing and
 * not-owned are byte-identical by design, so the UI renders an empty state
 * and never probes or reveals existence):
 *   GET  /api/rpg/professions/actors/:actorId — owner-scoped list
 *   GET  /api/rpg/professions/:id             — one profession + specializations
 *   POST /api/rpg/professions                 — { actorId, discipline } assign
 *   POST /api/rpg/professions/:id/xp          — { amount } (GM/testing affordance)
 *   POST /api/rpg/professions/:id/specialize  — { name, bonusType, bonusValue }
 * Pairs with `src/components/character/professions-panel.html`; state merges
 * into ChatState like `rpgStats` (see `chat/inline-state.ts`).
 */
import { apiFetch, } from "./htmx";
import { t, } from "./i18n";
import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";
import { readServerError, resolveChatActorId, } from "./rpg-stats-helpers";
import type { ChatState, ProfessionView, } from "./types";

const log = rootLog.child({ module: "professions", },);

/**
 * Progression constants mirrored from the server source of truth
 * (`src/rpg/crafting/professions/progression.ts` — LEVEL_XP, MAX_LEVEL,
 * TITLE_BANDS, progressionBonuses). Kept in sync by the pinning tests in
 * `professions.test.ts`.
 */
const LEVEL_XP = 100;
const MAX_LEVEL = 100;
/** XP granted per "Add XP" click (GM/testing affordance, per the ticket). */
const PROFESSION_XP_STEP = 50;

/** Crafting disciplines accepted by POST /api/rpg/professions (t.Enum schema). */
export const PROFESSION_DISCIPLINES = [
  "alchemy",
  "smithing",
  "enchanting",
  "cooking",
  "tailoring",
  "woodworking",
  "jewelry",
  "engineering",
] as const;

/** Title for a level (1-25 apprentice, 26-50 journeyman, 51-75 expert, 76-99 master, 100 grandmaster). */
function titleForLevel(level: number,): string {
  if (level >= 100) { return "grandmaster"; }
  if (level >= 76) { return "master"; }
  if (level >= 51) { return "expert"; }
  if (level >= 26) { return "journeyman"; }
  return "apprentice";
}

export const professions: Partial<ChatState> & ThisType<ChatState> = {
  professions: [] as ProfessionView[],
  professionsLoading: false,
  professionsError: null as string | null,
  selectedProfessionId: null as string | null,
  selectedProfessionSpecs: null as ChatState["selectedProfessionSpecs"],
  professionsBusyId: null as string | null,
  professionFeedback: null as ChatState["professionFeedback"],
  specDraft: { name: "", bonusType: "quality", bonusValue: 5, } as ChatState["specDraft"],
  assignDiscipline: "" as string,
  assignBusy: false,
  disciplines: PROFESSION_DISCIPLINES,

  async loadProfessions() {
    if (this.professionsLoading) { return; }
    this.professionsLoading = true;
    this.professionsError = null;
    try {
      const actorId = await resolveChatActorId(this.activeChat,);
      if (!actorId) {
        this.professions = [];
        return;
      }

      const res = await apiFetch(`/api/rpg/professions/actors/${encodeURIComponent(actorId,)}`,);
      // 404 renders the empty state — never an error, never a retry probe.
      if (res.status === 404) {
        this.professions = [];
        this.selectedProfessionId = null;
        return;
      }

      if (res.status === 403) {
        this.professions = [];
        this.professionsError = t("rpg.forbidden",);
        return;
      }

      if (!res.ok) {
        this.professions = [];
        this.professionsError = t("rpg.professions.loadFailed",);
        return;
      }

      const data = await res.json() as { professions?: ProfessionView[] };
      this.professions = Array.isArray(data.professions,) ? data.professions : [];
    } catch (error) {
      log.error("Failed to load professions", error instanceof Error ? error : undefined,);
      this.professions = [];
      this.professionsError = t("rpg.professions.loadFailed",);
    } finally {
      this.professionsLoading = false;
    }
  },

  async selectProfession(id: string,) {
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

      const data = await res.json() as { specializations?: ChatState["selectedProfessionSpecs"] };
      this.selectedProfessionSpecs = Array.isArray(data.specializations,) ? data.specializations : [];
    } catch (error) {
      log.error("Failed to load profession details", error instanceof Error ? error : undefined,);
      this.professionsError = t("rpg.professions.loadFailed",);
    }
  },

  assignableDisciplines() {
    const held = new Set(this.professions.map((p,) => p.discipline),);
    return [...this.disciplines,].filter((d,) => !held.has(d,));
  },

  async assignProfession() {
    if (this.assignBusy) { return; }
    if (!this.assignDiscipline) {
      this.professionsError = t("rpg.professions.assignPickDiscipline",);
      return;
    }

    this.assignBusy = true;
    this.professionsError = null;
    try {
      const actorId = await resolveChatActorId(this.activeChat,);
      if (!actorId) {
        this.professionsError = t("rpg.professions.assignFailed",);
        return;
      }

      const res = await apiFetch(`/api/rpg/professions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ actorId, discipline: this.assignDiscipline, },),
      },);

      if (res.status === 404) {
        await this.loadProfessions();
        return;
      }

      if (!res.ok) {
        this.professionsError = await readServerError(res, t("rpg.professions.assignFailed",),);
        return;
      }

      this.assignDiscipline = "";
      await this.loadProfessions();
    } catch (error) {
      log.error("Failed to assign profession", error instanceof Error ? error : undefined,);
      this.professionsError = t("rpg.professions.assignFailed",);
    } finally {
      this.assignBusy = false;
    }
  },

  async addProfessionXp(professionId: string,) {
    if (this.professionsBusyId) { return; }
    this.professionsBusyId = professionId;
    this.professionFeedback = null;
    try {
      const res = await apiFetch(`/api/rpg/professions/${encodeURIComponent(professionId,)}/xp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ amount: PROFESSION_XP_STEP, },),
      },);

      if (res.status === 404) {
        await this.loadProfessions();
        return;
      }

      if (!res.ok) {
        this.professionsError = await readServerError(res, t("rpg.professions.xpFailed",),);
        return;
      }

      const data = await res.json() as {
        leveledUp?: boolean;
        newLevel?: number;
        newTitle?: string;
        titleChanged?: boolean;
      };

      if (data.leveledUp) {
        this.professionFeedback = {
          professionId,
          leveledUp: true,
          newLevel: data.newLevel ?? 0,
          newTitle: data.newTitle ?? "",
          titleChanged: data.titleChanged ?? false,
        };
      }

      await this.loadProfessions();
    } catch (error) {
      log.error("Failed to add profession XP", error instanceof Error ? error : undefined,);
      this.professionsError = t("rpg.professions.xpFailed",);
    } finally {
      this.professionsBusyId = null;
    }
  },

  async addProfessionSpecialization(professionId: string,) {
    const name = this.specDraft.name.trim();
    if (!name) {
      this.professionsError = t("rpg.professions.specializeNameRequired",);
      return;
    }

    if (this.professionsBusyId) { return; }
    this.professionsBusyId = professionId;
    try {
      const res = await apiFetch(`/api/rpg/professions/${encodeURIComponent(professionId,)}/specialize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({
          name,
          bonusType: this.specDraft.bonusType,
          bonusValue: this.specDraft.bonusValue,
        },),
      },);

      if (res.status === 404) {
        await this.loadProfessions();
        return;
      }

      if (!res.ok) {
        this.professionsError = await readServerError(res, t("rpg.professions.specializeFailed",),);
        return;
      }

      this.specDraft = { name: "", bonusType: this.specDraft.bonusType, bonusValue: this.specDraft.bonusValue, };
      await this.selectProfession(professionId,);
    } catch (error) {
      log.error("Failed to specialize profession", error instanceof Error ? error : undefined,);
      this.professionsError = t("rpg.professions.specializeFailed",);
    } finally {
      this.professionsBusyId = null;
    }
  },

  /**
   * Level bonuses (fractions 0..1) — client mirror of the server ladder
   * (`progressionBonuses`): Journeyman +5% success, Expert +10% quality,
   * Master +15% speed, Grandmaster +20% all four.
   */
  professionBonuses(level: number,) {
    const title = titleForLevel(level,);
    const zero = { success: 0, quality: 0, speed: 0, materialSaving: 0, };
    switch (title) {
      case "journeyman":
        return { ...zero, success: 0.05, };
      case "expert":
        return { ...zero, quality: 0.10, };
      case "master":
        return { ...zero, speed: 0.15, };
      case "grandmaster":
        return { success: 0.20, quality: 0.20, speed: 0.20, materialSaving: 0.20, };
      default:
        return zero;
    }
  },

  /** Level where the next title band starts, or null at the cap. */
  nextTitleAt(level: number,) {
    if (level >= MAX_LEVEL) { return null; }
    return Math.min(MAX_LEVEL, (Math.floor((level - 1) / 25,) + 1) * 25 + 1,);
  },

  /** Progress through the current level (0..1); 1 at the cap. */
  xpProgress(profession: Pick<ProfessionView, "level" | "experience">,) {
    if (profession.level >= MAX_LEVEL) { return 1; }
    return Math.min(1, Math.max(0, (profession.experience % LEVEL_XP) / LEVEL_XP,),);
  },
};

// professions-panel.html binds methods through the ChatState scope, but the
// IIFE-wrapped bundle keeps module scopes private — expose for direct binds.
(globalThis as Record<string, unknown>).professions = professions;
(globalThis as Record<string, unknown>).PROFESSION_DISCIPLINES = PROFESSION_DISCIPLINES;
