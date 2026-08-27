// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

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

export function initTraits(fetchFn: typeof feFetch,) {
  _feFetch = fetchFn;
  // Wire slider display updates
  document.addEventListener("input", (e,) => {
    const target = e.target as HTMLInputElement;
    if (target.type === "range") {
      const valEl = document.querySelector(`#${target.id}-val`,);
      if (valEl) { valEl.textContent = target.value; }
    }
  },);
}

// ── Aspirations state ───────────────────────────────────────

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

(globalThis as Record<string, unknown>).removeAspiration = function(idx: number,) {
  aspirationsData.splice(idx, 1,);
  renderAspirations();
};

export function renderAspirations() {
  const container = document.querySelector("#aspirations-list",);
  if (!container) { return; }
  if (aspirationsData.length === 0) {
    container.innerHTML =
      '<p style="color:var(--text-secondary);font-size:var(--text-sm)">No aspirations defined yet.</p>';
    return;
  }
  const htmlParts: string[] = [];
  let idx = 0;
  for (const a of aspirationsData) {
    const i = idx++;
    htmlParts.push(`
    <div class="aspiration-row" style="display:flex;gap:var(--space-2);align-items:flex-start;margin-bottom:var(--space-2);padding:var(--space-2);background:var(--bg-secondary);border-radius:var(--radius-sm)">
      <input class="form-input" type="text" value="${a.goal}" placeholder="Goal" style="flex:1" onchange="aspirationsData[${i}].goal=this.value" />
      <select class="form-input" style="width:100px" onchange="aspirationsData[${i}].priority=this.value">
        <option value="high" ${a.priority === "high" ? "selected" : ""}>High</option>
        <option value="medium" ${a.priority === "medium" ? "selected" : ""}>Medium</option>
        <option value="low" ${a.priority === "low" ? "selected" : ""}>Low</option>
      </select>
      <select class="form-input" style="width:100px" onchange="aspirationsData[${i}].visibility=this.value">
        <option value="hidden" ${a.visibility === "hidden" ? "selected" : ""}>Hidden</option>
        <option value="hinted" ${a.visibility === "hinted" ? "selected" : ""}>Hinted</option>
        <option value="open" ${a.visibility === "open" ? "selected" : ""}>Open</option>
      </select>
      <button type="button" class="btn btn-danger btn-sm" onclick="removeAspiration(${i})">✕</button>
    </div>
    `,);
  }
  container.innerHTML = htmlParts.join("",);
}

// ── Helpers ─────────────────────────────────────────────────

function sliderVal(id: string,): number {
  const el = document.querySelector<HTMLInputElement>(`#${id}`,);
  return el ? parseFloatOr(el.value, 0,) : 0;
}
function textVal(id: string,): string {
  const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${id}`,);
  return el?.value ?? "";
}

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

export function updateSliderDisplays() {
  for (const [inputId, displayId,] of SLIDER_PAIRS) {
    const input = document.querySelector<HTMLInputElement>(`#${inputId}`,);
    const display = document.querySelector(`#${displayId}`,);
    if (input && display) { display.textContent = input.value; }
  }
}

// ── Load internal traits into form ──────────────────────────

/** Set slider/input values from a selector→value map. */
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
