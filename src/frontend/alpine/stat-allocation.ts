// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Character stat allocation panel.
// Drives:
//   GET /api/v1/rpg/trait-catalog?worldId=…
//   GET /api/v1/rpg/stat-allocation/:actorId
//   PUT /api/v1/rpg/stat-allocation/:actorId
// Pairs with `src/components/character/stat-allocation-panel.html`.
import { type AbilityName, ALL_ABILITIES, type StatBlock, statCost, } from "../../rpg/stats/types.js";
import { apiFetch, } from "./htmx";
import { t, } from "./i18n";
import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";

export { ALL_ABILITIES, };
export type { AbilityName, StatBlock, };

/** Catalog entry as returned by the trait-catalog route */
export interface CatalogTrait {
  id: string;
  label: string;
  scope: "universal" | "world";
  effects: readonly { kind: string }[];
}

/** Stored allocation as returned by the route */
export interface StatAllocationRead {
  worldId: string;
  stats: StatBlock;
  traitIds: string[];
}

/** World stat config as returned by the stat-config route */
export interface StatConfigRead {
  requiresStats: number;
  statPointBudget: number;
  statMin: number;
  statMax: number;
  pointBuyCost: Record<number, number>;
}

export interface StatAllocationState {
  saActorId: string | null;
  saWorldId: string;
  stats: StatBlock;
  statMin: number | null;
  statMax: number | null;
  budget: number | null;
  configLoaded: boolean;
  pointBuyCost: Record<number, number>;
  catalog: CatalogTrait[];
  selectedTraits: string[];
  loading: boolean;
  saving: boolean;
  error: string;
  message: string;
  setBinding(actorId: string, worldId: string,): void;
  loadConfig(worldId: string,): Promise<void>;
  loadCatalog(worldId: string,): Promise<void>;
  loadStored(actorId: string,): Promise<void>;
  load(): Promise<void>;
  budgetRemaining(): number;
  modifier(ability: AbilityName,): number;
  nudge(ability: AbilityName, delta: number,): void;
  toggleTrait(id: string,): void;
  save(): Promise<void>;
}

const log = rootLog.child({ module: "stat-allocation", },);

const defaultStats = (): StatBlock => ({ str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, });

export const statAllocation: StatAllocationState = {
  saActorId: null,
  saWorldId: "",
  stats: defaultStats(),
  statMin: null,
  statMax: null,
  budget: null,
  configLoaded: false,
  pointBuyCost: {},
  catalog: [],
  selectedTraits: [],
  loading: false,
  saving: false,
  error: "",
  message: "",

  setBinding(actorId: string, worldId: string,) {
    if (this.saActorId === actorId && this.saWorldId === worldId) {
      return;
    }

    this.saActorId = actorId;
    this.saWorldId = worldId;
    this.stats = defaultStats();
    this.selectedTraits = [];
    this.error = "";
    this.message = "";
  },

  async loadConfig(worldId: string,) {
    const res = await apiFetch(`/api/v1/rpg/stat-config?worldId=${encodeURIComponent(worldId,)}`, {},);

    if (!res.ok) {
      this.error = t("status.allocationLoadFailed",);

      return;
    }

    const config = (await res.json()) as StatConfigRead;

    this.statMin = config.statMin;
    this.statMax = config.statMax;
    this.budget = config.statPointBudget;
    this.pointBuyCost = { ...config.pointBuyCost, };
    this.configLoaded = true;
    const clamped = { ...this.stats, };
    for (const ability of ALL_ABILITIES) {
      clamped[ability] = Math.min(config.statMax, Math.max(config.statMin, clamped[ability],),);
    }

    this.stats = clamped;
  },

  async loadCatalog(worldId: string,) {
    const res = await apiFetch(`/api/v1/rpg/trait-catalog?worldId=${encodeURIComponent(worldId,)}`, {},);

    if (!res.ok) {
      this.error = t("status.allocationLoadFailed",);

      return;
    }

    const traits = (await res.json()) as CatalogTrait[];

    this.catalog = Array.isArray(traits,) ? traits : [];
  },

  async loadStored(actorId: string,) {
    const res = await apiFetch(`/api/v1/rpg/stat-allocation/${actorId}`, {},);

    if (res.ok) {
      const alloc = (await res.json()) as StatAllocationRead;
      const clamped = { ...alloc.stats, };
      if (this.statMin !== null && this.statMax !== null) {
        for (const ability of ALL_ABILITIES) {
          clamped[ability] = Math.min(this.statMax, Math.max(this.statMin, clamped[ability],),);
        }
      }

      this.stats = clamped;
      this.selectedTraits = [...alloc.traitIds,];

      return;
    }

    if (res.status !== 404) {
      this.error = t("status.allocationLoadFailed",);
    }
  },

  async load() {
    const actorId = this.saActorId;
    const worldId = this.saWorldId;
    if (!actorId || !worldId) {
      return;
    }

    this.loading = true;
    this.error = "";
    try {
      await this.loadConfig(worldId,);
      await this.loadCatalog(worldId,);
      await this.loadStored(actorId,);
    } catch (error) {
      log.error("Failed to load allocation", error instanceof Error ? error : undefined, {},);
      this.error = t("status.allocationLoadFailed",);
    } finally {
      this.loading = false;
    }
  },

  budgetRemaining() {
    if (this.budget === null) {
      return 0;
    }

    const spent = ALL_ABILITIES.reduce((sum, ability,) => {
      const value = this.stats[ability];
      const served = this.pointBuyCost[value];
      return sum + (served ?? statCost(value,));
    }, 0,);

    return this.budget - spent;
  },

  modifier(ability: AbilityName,) {
    return Math.floor((this.stats[ability] - 10) / 2,);
  },

  nudge(ability: AbilityName, delta: number,) {
    if (this.statMin === null || this.statMax === null) {
      return;
    }

    const next = Math.min(this.statMax, Math.max(this.statMin, this.stats[ability] + delta,),);
    this.stats = { ...this.stats, [ability]: next, };
  },

  toggleTrait(id: string,) {
    this.selectedTraits = this.selectedTraits.includes(id,)
      ? this.selectedTraits.filter((trait,) => trait !== id)
      : [...this.selectedTraits, id,];
  },

  async save() {
    const actorId = this.saActorId;
    const worldId = this.saWorldId;
    if (!actorId || !worldId) {
      return;
    }

    this.saving = true;
    this.error = "";
    this.message = "";
    try {
      const res = await apiFetch(`/api/v1/rpg/stat-allocation/${actorId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ worldId, stats: this.stats, traitIds: this.selectedTraits, },),
      },);

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;

        this.error = body?.error ?? t("status.allocationSaveFailed",);

        return;
      }

      this.message = t("status.allocationSaved",);
    } catch (error) {
      log.error("Failed to save allocation", error instanceof Error ? error : undefined, {},);
      this.error = t("status.allocationSaveFailed",);
    } finally {
      this.saving = false;
    }
  },
};

/**
 * Build the Alpine scope for the stat allocation panel.
 * @param actorId
 * @param worldId
 * @returns the allocation panel state bound to the actor + world.
 */
export function statAllocationFactory(actorId: string, worldId: string,): StatAllocationState {
  const state = Object.create(statAllocation,) as StatAllocationState;
  state.saActorId = null;
  state.saWorldId = "";
  state.stats = defaultStats();
  state.statMin = null;
  state.statMax = null;
  state.budget = null;
  state.configLoaded = false;
  state.selectedTraits = [];
  state.pointBuyCost = {};
  state.catalog = [];
  state.error = "";
  state.message = "";
  state.setBinding(actorId, worldId,);
  void state.load();
  return state;
}

(globalThis as Record<string, unknown>).statAllocationFactory = statAllocationFactory;
