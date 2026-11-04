// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Skills tree panel mixin (TASK-skills-frontend).
 *
 * Drives (server is the authz boundary; 404 == "not visible" — missing and
 * not-owned are byte-identical by design, so the UI renders an empty state
 * and never probes or reveals existence):
 *   GET  /api/rpg/skills/actors/:actorId — owner-scoped skill list
 *   POST /api/rpg/skills/:id/xp          — { xpAmount } (GM/testing affordance)
 *   POST /api/rpg/skills/:id/specialize  — { specialization }
 * Pairs with `src/components/character/skills-panel.html`; state merges into
 * ChatState like `rpgStats` (see `chat/inline-state.ts`).
 */
import { apiFetch, } from "./htmx";
import { t, } from "./i18n";
import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";
import { readServerError, resolveChatActorId, } from "./rpg-stats-helpers";
import type { ChatState, SkillView, } from "./types";

const log = rootLog.child({ module: "skill-tree", },);

/** XP granted per "Add XP" click (GM/testing affordance, per the ticket). */
const SKILL_XP_STEP = 100;

export const skillTree: Partial<ChatState> & ThisType<ChatState> = {
  skills: [] as SkillView[],
  skillsLoading: false,
  skillsError: null as string | null,
  selectedSkillId: null as string | null,
  skillsBusyId: null as string | null,
  skillFeedback: null as ChatState["skillFeedback"],
  skillSpecName: "" as string,
  openCategories: {} as Record<string, boolean>,

  async loadSkills() {
    if (this.skillsLoading) { return; }
    this.skillsLoading = true;
    this.skillsError = null;
    try {
      const actorId = await resolveChatActorId(this.activeChat,);
      if (!actorId) {
        this.skills = [];
        return;
      }

      const res = await apiFetch(`/api/rpg/skills/actors/${encodeURIComponent(actorId,)}`,);
      // 404 renders the empty state — never an error, never a retry probe.
      if (res.status === 404) {
        this.skills = [];
        this.selectedSkillId = null;
        return;
      }

      if (res.status === 403) {
        this.skills = [];
        this.skillsError = t("rpg.forbidden",);
        return;
      }

      if (!res.ok) {
        this.skills = [];
        this.skillsError = t("rpg.skills.loadFailed",);
        return;
      }

      const data = await res.json() as { skills?: SkillView[] };
      this.skills = Array.isArray(data.skills,) ? data.skills : [];
    } catch (error) {
      log.error("Failed to load skills", error instanceof Error ? error : undefined,);
      this.skills = [];
      this.skillsError = t("rpg.skills.loadFailed",);
    } finally {
      this.skillsLoading = false;
    }
  },

  skillsByCategory() {
    const groups = new Map<string, SkillView[]>();
    for (const skill of this.skills) {
      const list = groups.get(skill.category,);
      if (list) { list.push(skill,); }
      else { groups.set(skill.category, [skill,],); }
    }

    return Array.from(groups.entries(),)
      .map(([category, skills,],) => ({ category, skills: [...skills,].sort((a, b,) => b.level - a.level), }))
      .sort((a, b,) => a.category.localeCompare(b.category,));
  },

  isCategoryOpen(category: string,) {
    return this.openCategories[category] ?? true;
  },

  toggleCategory(category: string,) {
    this.openCategories[category] = !this.isCategoryOpen(category,);
  },

  toggleSkill(id: string,) {
    this.selectedSkillId = this.selectedSkillId === id ? null : id;
    this.skillFeedback = null;
    this.skillSpecName = "";
  },

  selectedSkill() {
    return this.skills.find((s,) => s.id === this.selectedSkillId) ?? null;
  },

  async addSkillXp(skillId: string,) {
    if (this.skillsBusyId) { return; }
    this.skillsBusyId = skillId;
    this.skillFeedback = null;
    try {
      const res = await apiFetch(`/api/rpg/skills/${encodeURIComponent(skillId,)}/xp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ xpAmount: SKILL_XP_STEP, },),
      },);

      // Stale/hidden row: refresh so the UI stops showing it; never an error.
      if (res.status === 404) {
        await this.loadSkills();
        return;
      }

      if (!res.ok) {
        this.skillsError = await readServerError(res, t("rpg.skills.xpFailed",),);
        return;
      }

      const data = await res.json() as { leveledUp?: boolean; xpGained?: number; newProficiency?: string };
      if (data.leveledUp) {
        this.skillFeedback = {
          skillId,
          xpGained: data.xpGained ?? 0,
          newProficiency: data.newProficiency ?? null,
        };
      }

      await this.loadSkills();
    } catch (error) {
      log.error("Failed to add skill XP", error instanceof Error ? error : undefined,);
      this.skillsError = t("rpg.skills.xpFailed",);
    } finally {
      this.skillsBusyId = null;
    }
  },

  async specializeSkill(skillId: string,) {
    const specialization = this.skillSpecName.trim();
    if (!specialization) {
      this.skillsError = t("rpg.skills.specializeNameRequired",);
      return;
    }

    if (this.skillsBusyId) { return; }
    this.skillsBusyId = skillId;
    try {
      const res = await apiFetch(`/api/rpg/skills/${encodeURIComponent(skillId,)}/specialize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ specialization, },),
      },);

      if (res.status === 404) {
        await this.loadSkills();
        return;
      }

      if (!res.ok) {
        this.skillsError = await readServerError(res, t("rpg.skills.specializeFailed",),);
        return;
      }

      this.skillSpecName = "";
      await this.loadSkills();
    } catch (error) {
      log.error("Failed to specialize skill", error instanceof Error ? error : undefined,);
      this.skillsError = t("rpg.skills.specializeFailed",);
    } finally {
      this.skillsBusyId = null;
    }
  },
};

// skills-panel.html binds methods through the ChatState scope, but the
// IIFE-wrapped bundle keeps module scopes private — expose for direct binds.
(globalThis as Record<string, unknown>).skillTree = skillTree;
