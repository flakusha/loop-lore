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
import { PROFESSION_DISCIPLINES, PROFESSION_XP_STEP, } from "./professions-constants";
import { nextTitleAt, professionBonuses, xpProgress, } from "./professions-progression";
import { readServerError, resolveChatActorId, } from "./rpg-stats-helpers";
import type { ChatState, ProfessionView, } from "./types";

const log = rootLog.child({ module: "professions", },);

export { PROFESSION_DISCIPLINES, PROFESSION_XP_STEP, } from "./professions-constants";

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
   * Level bonuses (fractions 0..1) — server ladder via the progression
   * mirror (`./professions-progression`).
   */
  professionBonuses,

  /** Level where the next title band starts, or null at the cap. */
  nextTitleAt,

  /** Progress through the current level (0..1); 1 at the cap. */
  xpProgress,
};

// professions-panel.html binds methods through the ChatState scope, but the
// IIFE-wrapped bundle keeps module scopes private — expose for direct binds.
(globalThis as Record<string, unknown>).professions = professions;
