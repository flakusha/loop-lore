// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * World creation wizard (TASK-world-dashboard) — the multi-step create flow
 * on the worlds page: name/style → conditions → first locations → review.
 *
 * It posts to the EXISTING world endpoints; no new server route:
 *   - `POST /api/v1/worlds`                  (WorldCreateBody: name,
 *                                             description, lore, kind,
 *                                             visibility)
 *   - `POST /api/v1/worlds/:worldId/locations` for each queued location
 *
 * Location conditions (time of day / weather) are collected as author-set
 * labels. There is no weather or clock engine in this build, so nothing
 * simulates them — the review step labels them as author-set.
 */
import { apiFetch, } from "./htmx";
import { t, } from "./i18n";
import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";

const log = rootLog.child({ module: "world-create-wizard", },);

/** The four wizard steps, in order. */
export const WIZARD_STEPS = ["basics", "conditions", "locations", "review",] as const;

/** One wizard step id. */
export type WizardStep = (typeof WIZARD_STEPS)[number];

/** A location the user queued in step 3, before the world exists. */
export interface WizardLocation {
  name: string;
}

/** World creation wizard state. */
export interface WorldCreateWizardState {
  step: number;
  name: string;
  description: string;
  kind: string;
  style: string;
  visibility: string;
  rpgEnabled: boolean;
  rpgXp: boolean;
  rpgSkills: boolean;
  timeOfDay: string;
  weather: string;
  locations: WizardLocation[];
  locationName: string;
  busy: boolean;
  error: string;
  next(): void;
  back(): void;
  addLocation(): void;
  removeLocation(index: number,): void;
  create(): Promise<void>;
}

/**
 * Narrow an unknown JSON body to a single string field. Network responses are
 * outside-controlled, so every field read here is checked at runtime.
 * @param body parsed JSON of unknown shape
 * @param field key to read
 * @returns the string value, or null when absent / not a string
 */
function readString(body: unknown, field: string,): string | null {
  if (body === null || typeof body !== "object") { return null; }
  if (!(field in body)) { return null; }
  const value: unknown = (body as Record<string, unknown>)[field];
  return typeof value === "string" ? value : null;
}

/**
 * @param step current zero-based step index
 * @returns the i18n step label for that step, empty past the last one
 */
export function stepLabel(step: number,): string {
  const id: WizardStep | undefined = WIZARD_STEPS[step];
  if (id === undefined) { return ""; }
  return t(`worlds.wizardStep${id.charAt(0,).toUpperCase()}${id.slice(1,)}`,);
}

/**
 * Build the wizard state object. Exported so tests can drive it without a
 * browser; the module also publishes it on globalThis for the template.
 * @returns {WorldCreateWizardState}
 */
export function buildWorldCreateWizard(): WorldCreateWizardState {
  return {
    step: 0,
    name: "",
    description: "",
    kind: "rpg",
    style: "fantasy",
    visibility: "private",
    rpgEnabled: true,
    rpgXp: true,
    rpgSkills: true,
    timeOfDay: "",
    weather: "",
    locations: [],
    locationName: "",
    busy: false,
    error: "",

    /** @returns {void} */
    next() {
      if (this.step === 0 && !this.name.trim()) {
        this.error = t("worlds.wizardNameRequired",);
        return;
      }

      this.error = "";
      if (this.step < WIZARD_STEPS.length - 1) { this.step += 1; }
    },

    /** @returns {void} */
    back() {
      this.error = "";
      if (this.step > 0) { this.step -= 1; }
    },

    /** @returns {void} */
    addLocation() {
      const name = this.locationName.trim();
      if (name === "") { return; }
      this.locations.push({ name, },);
      this.locationName = "";
    },

    /**
     * @param index row to drop
     * @returns {void}
     */
    removeLocation(index: number,) {
      this.locations.splice(index, 1,);
    },

    /**
     * Create the world, then its queued locations, then land on the edit page
     * — the same destination the quick-create modal uses.
     * @returns {Promise<void>}
     */
    async create() {
      if (!this.name.trim()) {
        this.error = t("worlds.wizardNameRequired",);
        this.step = 0;
        return;
      }

      this.busy = true;
      this.error = "";
      try {
        const res = await apiFetch("/api/v1/worlds", {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({
            name: this.name.trim(),
            description: this.description,
            kind: this.kind,
            visibility: this.visibility,
            rpgEnabled: this.kind === "rpg" && this.rpgEnabled,
            rpgXp: this.kind === "rpg" && this.rpgEnabled && this.rpgXp,
            rpgSkills: this.kind === "rpg" && this.rpgEnabled && this.rpgSkills,
          },),
        },);

        const worldId = res.ok ? readString(await res.json(), "id",) : null;
        if (worldId === null) {
          this.error = readString(await res.json().catch(() => null), "error",) ?? t("worlds.wizardFailed",);
          return;
        }

        for (const loc of this.locations) {
          const locRes = await apiFetch(`/api/v1/worlds/${worldId}/locations`, {
            method: "POST",
            headers: { "Content-Type": "application/json", },
            body: jsonBody({ name: loc.name, },),
          },);

          // A rejected location must not discard the world the user just made:
          // log it and still land on the edit page, where they can retry.
          if (!locRes.ok) { log.warn("wizard location create failed", { worldId, },); }
        }

        document.querySelector("#create-world-wizard-modal",)?.classList.remove("open",);
        globalThis.location.assign(`/worlds/${worldId}/edit`,);
      } catch (error) {
        log.warn("wizard world create failed", { error: String(error,), },);
        this.error = t("worlds.wizardFailed",);
      } finally {
        this.busy = false;
      }
    },
  };
}

const globals = globalThis as unknown as {
  worldCreateWizard?: () => WorldCreateWizardState;
  worldWizardStepLabel?: (step: number,) => string;
};

globals.worldCreateWizard = buildWorldCreateWizard;
globals.worldWizardStepLabel = stepLabel;
