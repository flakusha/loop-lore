// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 275

/**
 * Character Internal Traits — Frontend Logic
 *
 * Loaded by characters.ts page. Handles loading/saving internal traits
 * from the character edit form. Proactive messaging config lives in
 * characters-proactive.ts.
 */
import { jsonBody, } from "../alpine/json";
import { browserRandomUUIDv7, } from "../browser";
import type { feFetch, } from "../fe-fetch";
import { parseFloatOr, } from "../utils/parse-number";

// Shared feFetch — caller passes it in to avoid circular import
let _feFetch: typeof feFetch;

/**
 * @param fetchFn
 */
export function initTraits(fetchFn: typeof feFetch,) {
  _feFetch = fetchFn;
  // Wire slider display updates
  if (typeof document.addEventListener !== "function") { return; }
  document.addEventListener("input", (e,) => {
    const target = e.target as HTMLInputElement;
    if (target.type === "range") {
      const valEl = document.querySelector(`#${target.id}-val`,);
      if (valEl) { valEl.textContent = target.value; }
    }
  },);
}

// ── Aspirations state ───────────────────────────────────────

/** */
export type Aspiration = {
  id: string;
  goal: string;
  plans: string[];
  visibility: string;
  priority: string;
  progress: number;
};

let aspirationsData: Aspiration[] = [];

(globalThis as Record<string, unknown>).addAspiration = function() {
  // UUIDv7 gives chronological ordering; the server treats this id as opaque.
  const id = browserRandomUUIDv7();
  aspirationsData.push({ id, goal: "", plans: [], visibility: "hidden", priority: "medium", progress: 0, },);
  renderAspirations();
};

function removeAspiration(idx: number,): void {
  aspirationsData.splice(idx, 1,);
  renderAspirations();
}
(globalThis as Record<string, unknown>).removeAspiration = removeAspiration;
/** */
export function renderAspirations() {
  const container = document.querySelector("#aspirations-list",);
  if (!container) { return; }
  // Clear via DOM API so any previously-attached listeners are released before
  // we replace the children. innerHTML replacement alone would leak listeners
  // on detached nodes.
  while (container.firstChild) { container.removeChild(container.firstChild,); }
  if (aspirationsData.length === 0) {
    const empty = document.createElement("p",);
    empty.style.cssText = "color:var(--text-secondary);font-size:var(--text-sm)";
    empty.textContent = "No aspirations defined yet.";
    container.appendChild(empty,);
    return;
  }
  aspirationsData.forEach((a, i,) => {
    const row = document.createElement("div",);
    row.className = "aspiration-row";
    row.style.cssText =
      "display:flex;gap:var(--space-2);align-items:flex-start;margin-bottom:var(--space-2);padding:var(--space-2);background:var(--bg-secondary);border-radius:var(--radius-sm)";
    row.dataset["aspirationIndex"] = String(i,);

    const goal = document.createElement("input",);
    goal.className = "form-input";
    goal.type = "text";
    goal.value = a.goal;
    goal.placeholder = "Goal";
    goal.style.flex = "1";
    goal.addEventListener("change", () => {
      aspirationsData[i]!.goal = goal.value;
    },);

    const priority = document.createElement("select",);
    priority.className = "form-input";
    priority.style.width = "100px";
    for (const v of ["high", "medium", "low",] as const) {
      const opt = document.createElement("option",);
      opt.value = v;
      opt.textContent = v[0]!.toUpperCase() + v.slice(1,);
      if (a.priority === v) { opt.selected = true; }
      priority.appendChild(opt,);
    }
    priority.addEventListener("change", () => {
      aspirationsData[i]!.priority = priority.value;
    },);

    const visibility = document.createElement("select",);
    visibility.className = "form-input";
    visibility.style.width = "100px";
    for (const v of ["hidden", "hinted", "open",] as const) {
      const opt = document.createElement("option",);
      opt.value = v;
      opt.textContent = v[0]!.toUpperCase() + v.slice(1,);
      if (a.visibility === v) { opt.selected = true; }
      visibility.appendChild(opt,);
    }
    visibility.addEventListener("change", () => {
      aspirationsData[i]!.visibility = visibility.value;
    },);

    const remove = document.createElement("button",);
    remove.type = "button";
    remove.className = "btn btn-danger btn-sm";
    remove.textContent = "✕";
    remove.addEventListener("click", () => {
      removeAspiration(i,);
    },);

    row.append(goal, priority, visibility, remove,);
    container.appendChild(row,);
  },);
}

// ── Helpers ─────────────────────────────────────────────────

/**
 * @param id
 */
function sliderVal(id: string,): number {
  const el = document.querySelector<HTMLInputElement>(`#${id}`,);
  return el ? parseFloatOr(el.value, 0,) : 0;
}
/**
 * @param id
 */
function textVal(id: string,): string {
  const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${id}`,);
  return el?.value ?? "";
}

/**
 * @param selector
 * @param value
 */
function setVal(selector: string, value: string | undefined,) {
  const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector,);
  if (el && value != null) { el.value = value; }
}

const SLIDER_PAIRS: [string, string,][] = [
  ["moral-lawful", "moral-lawful-val",],
  ["moral-good", "moral-good-val",],
  ["auto-group", "auto-group-val",],
  ["auto-solo", "auto-solo-val",],
  ["approach-risk", "approach-risk-val",],
  ["approach-initiative", "approach-initiative-val",],
  ["voice-emotional", "voice-emotional-val",],
];

/** */
export function updateSliderDisplays() {
  for (const [inputId, displayId,] of SLIDER_PAIRS) {
    const input = document.querySelector<HTMLInputElement>(`#${inputId}`,);
    const display = document.querySelector(`#${displayId}`,);
    if (input && display) { display.textContent = input.value; }
  }
}

// ── Load internal traits into form ──────────────────────────

/**
 * Set slider/input values from a selector→value map.
 * @param entries
 * @param update
 */
function hydrateSliders(entries: Array<[string, string | number | boolean,]>, update = true,): void {
  for (const [selector, val,] of entries) {
    const el = document.querySelector<HTMLInputElement>(selector,);
    if (el && val != null) { el.value = String(val,); }
  }
  if (update) { updateSliderDisplays(); }
}

(globalThis as Record<string, unknown>).loadInternalTraits = async function(actorId: string,) {
  try {
    const res = await _feFetch(`/api/character-internal-traits?actorId=${actorId}`,);
    if (!res.ok) { return; }
    const data = await res.json();
    if (data.aspirations) {
      aspirationsData = data.aspirations;
      renderAspirations();
    }
    if (data.moralDisposition) {
      hydrateSliders([
        ["#moral-lawful", data.moralDisposition.lawful_chaotic ?? 0,],
        ["#moral-good", data.moralDisposition.good_evil ?? 0,],
      ],);
    }
    if (data.autonomyPreferences) {
      hydrateSliders([
        ["#auto-group", data.autonomyPreferences.group_comfort ?? 0.5,],
        ["#auto-solo", data.autonomyPreferences.solo_comfort ?? 0.5,],
      ],);
    }
    if (data.copingMechanisms) {
      setVal("#cope-stress", data.copingMechanisms.stress_response,);
      setVal("#cope-failure", data.copingMechanisms.failure_response,);
      setVal("#cope-conflict", data.copingMechanisms.conflict_style,);
    }
    if (data.approachTendencies) {
      setVal("#approach-decision", data.approachTendencies.decision_style,);
      hydrateSliders([
        ["#approach-risk", data.approachTendencies.risk_tolerance ?? 0.5,],
        ["#approach-initiative", data.approachTendencies.initiative_level ?? 0.5,],
      ],);
    }
    if (data.voicePatterns) {
      setVal("#voice-tics", (data.voicePatterns.verbal_tics ?? []).join(", ",),);
      setVal("#voice-vocab", data.voicePatterns.vocabulary_level,);
      setVal("#voice-structure", data.voicePatterns.sentence_structure,);
      setVal("#voice-humor", data.voicePatterns.humor_style,);
      hydrateSliders([
        ["#voice-emotional", data.voicePatterns.emotional_range ?? 0.5,],
      ],);
    }
  } catch { /* traits not yet created — use defaults */ }
};

// ── Build payload + save ────────────────────────────────────

/** */
function buildTraitsPayload() {
  const activeAspirations: Aspiration[] = [];
  for (const a of aspirationsData) {
    if (a.goal.trim() !== "") { activeAspirations.push(a,); }
  }
  const voiceTics: string[] = [];
  for (const s of textVal("voice-tics",).split(",",)) {
    const trimmed = s.trim();
    if (trimmed) { voiceTics.push(trimmed,); }
  }
  return {
    aspirations: activeAspirations,
    moralDisposition: {
      lawful_chaotic: sliderVal("moral-lawful",),
      good_evil: sliderVal("moral-good",),
    },
    autonomyPreferences: {
      group_comfort: sliderVal("auto-group",),
      solo_comfort: sliderVal("auto-solo",),
    },
    copingMechanisms: {
      stress_response: textVal("cope-stress",) || undefined,
      failure_response: textVal("cope-failure",) || undefined,
      conflict_style: textVal("cope-conflict",) || undefined,
    },
    approachTendencies: {
      decision_style: textVal("approach-decision",) || undefined,
      risk_tolerance: sliderVal("approach-risk",),
      initiative_level: sliderVal("approach-initiative",),
    },
    voicePatterns: {
      verbal_tics: voiceTics,
      vocabulary_level: textVal("voice-vocab",) || undefined,
      sentence_structure: textVal("voice-structure",) || undefined,
      humor_style: textVal("voice-humor",) || undefined,
      emotional_range: sliderVal("voice-emotional",),
    },
  };
}

(globalThis as Record<string, unknown>).saveInternalTraits = async function(actorId: string,) {
  const status = document.querySelector<HTMLElement>("#traits-status",);
  try {
    const res = await _feFetch(`/api/character-internal-traits?actorId=${actorId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", },
      body: jsonBody(buildTraitsPayload(),),
    },);
    if (res.ok) {
      if (status) {
        status.textContent = "✓ Internal traits saved";
        status.style.color = "var(--color-success)";
      }
    } else {
      if (status) {
        status.textContent = "✗ Failed to save traits";
        status.style.color = "var(--color-error)";
      }
    }
  } catch {
    if (status) {
      status.textContent = "✗ Failed to save traits";
      status.style.color = "var(--color-error)";
    }
  }
};
