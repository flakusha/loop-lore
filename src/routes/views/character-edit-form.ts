// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 275

/**
 * Character Edit Form — HTML template builder
 *
 * Extracted from characters.ts to stay under size gate.
 * Called by serveCharacterEditForm after loading the actor from DB.
 */

import { readFileSync, } from "node:fs";
import { join, } from "node:path";
import { avatarFocusSection, } from "./avatar-focus-section";
import { INTERNAL_TRAITS_SECTION, PROACTIVE_SECTION, } from "./character-edit-sections";
import { growthSection, } from "./character-growth-section";
import { panelsSection, } from "./character-panels-section";
import { journalKeyphraseSection, } from "./journal-keyphrase-section";
import { escapeHtml, } from "./layout";

/** Stricter escape for values interpolated inside single- or double-quoted attributes
 * @param str - raw string
 * @returns attribute-escaped string
 * and JavaScript string literals (e.g. `onclick='...'`). Also encodes `'`. */
function escapeAttr(str: string,): string {
  return escapeHtml(str,).replaceAll("'", "&#39;",);
}

const CHARACTER_COMPONENTS_DIR = join(import.meta.dir, "..", "..", "components", "character",);
const panelBodyCache = new Map<string, string>();

/** Load a character panel template inner body. The outer mount tag (which
 *  carries its own `x-data`) is stripped — the caller provides the `x-data`
 *  wrapper. Results cached per process.
 * @param file - panel template filename
 * @returns the stripped panel body HTML
 */
function loadPanelBody(file: string,): string {
  const cached = panelBodyCache.get(file,);
  if (cached !== undefined) { return cached; }
  const raw = readFileSync(join(CHARACTER_COMPONENTS_DIR, file,), "utf8",);
  // Drop license + mount-doc comments, then the outer mount tag (which
  // carries its own `x-data` — the caller provides the wrapper instead).
  const body = raw
    .replace(/<!--[\s\S]*?-->/g, "",)
    .replace(/^[\s\S]*?<(?:section|div)[^>]*>/, "",)
    .replace(/<\/(?:section|div)>\s*$/, "",)
    .trim();

  panelBodyCache.set(file, body,);
  return body;
}

/**
 * Collapsible Rich Extension Fields section. Drives the
 * `characterExtensionEditorFactory` Alpine plugin and serializes the
 * canonical draft to a single `PUT /api/actors/:actorId` round-trip.
 * Bundle requirements travel in via the factory's second argument; the
 * server-side renderer doesn't statically know which bundle a character
 * opts into, so the factory starts with `undefined` requirements and
 * the FE lazy-binds via `setBundleRequirements(...)` after the load.
 *
 * @param characterId - actor id interpolated into the panel wrapper
 * @param loadBody - panel template loader (filename → inner body HTML)
 * @param escapeAttr - attribute escaper for the actor id
 * @returns the rich-extension-editor section HTML
 */
export function extensionEditorSection(
  characterId: string,
  loadBody: (file: string,) => string,
  escapeAttr: (str: string,) => string,
): string {
  return `        <details class="form-section" data-testid="character-extension-editor-section" open style="margin-top:var(--space-6);border:1px solid var(--border-default);border-radius:var(--radius-md);padding:var(--space-4)">
          <summary style="cursor:pointer;font-weight:600;font-size:var(--text-lg)">Rich Extension Fields</summary>
          <p class="form-hint" style="color:var(--text-secondary);margin:var(--space-2) 0 var(--space-4)">Bundle-driven fields: ability scores, inventory, vitals, equipment, motivations, relationships, appearance details, and more. Saved to the character's <code>settings</code> blob via PUT.</p>
          <div x-data="characterExtensionEditorFactory('${escapeAttr(characterId,)}', undefined,)">
            <section>${loadBody("extension-editor-panel.html",)}</section>
          </div>
        </details>`;
}

/** Input values for the edit form */
export interface EditFormValues {
  name: string;
  desc: string;
  systemPrompt: string;
  personality: string;
  appearance: string;
  defaultOutfit: string;
  welcome: string;
  scenario: string;
  mesExample: string;
  postHistory: string;
  avatarHtml: string;
  avatarId: string;
  avatarRemoveBtn: string;
  characterId: string;
  /** Avatar crop focus percentages (0-100); applied to `object-position` (TASK-001). */
  avatarFocusX: number;
  avatarFocusY: number;
  /** Optimistic-concurrency version captured when the form loaded (CHAR-1). */
  dataVersion: number;
  /** Author growth toggle (epic-character-growth D1); dynamic (default) or static. */
  growthMode: string;
  /** Opt-in LLM-assist pass (D6); off by default. */
  llmAssistEnabled: boolean;
  /** Current arc stage (character_arc.current_stage); introduction when none. */
  arcStage: string;
  /** Arc stage description (character_arc.stage_description); "" when none. */
  arcDescription: string;
  /** Recent applied growth entries, newest first (epic-character-growth); empty when none. */
  recentEntries: Array<{ axis: string; reason: string; recordedAt: string }>;
  /** 5-tier NSFW content rating (sfw | nsfw_mild | nsfw_moderate | nsfw_intense | nsfw_extreme). */
  contentRating: string;
}

/**
 * Called by serveCharacterEditForm after DB lookup.
 *
 * When `cspNonce` is supplied, the inline `<script>` block at the foot of
 * the form carries the nonce so it executes under the strict CSP (no
 * `'unsafe-inline'`). When omitted, the script emits without a nonce —
 * acceptable in tests / non-CSP contexts.
 * @param v - edit form values
 * @param options
 * @param options.cspNonce
 * @returns the edit form HTML
 */
export function buildEditFormHtml(v: EditFormValues, options: { cspNonce?: string } = {},): string {
  const nonceAttr = options.cspNonce ? ` nonce="${options.cspNonce}"` : "";
  return `<div style="max-width:720px;margin:0 auto;width:100%">
      <form id="char-edit-form" data-testid="character-edit-form">
        <input type="hidden" id="char-avatar-id" value="${escapeAttr(v.avatarId,)}" />
        <input type="hidden" id="char-data-version" value="${v.dataVersion}" />
        <div class="form-group" style="display:flex;align-items:flex-start;gap:var(--space-4)">
          <div style="width:80px;height:80px;border-radius:var(--radius-md);background:var(--bg-tertiary);display:flex;align-items:center;justify-content:center;font-size:36px;flex-shrink:0;overflow:hidden;border:1px solid var(--border-default)">
            <div id="avatar-preview">${v.avatarHtml}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:var(--space-2)">
            <label class="btn btn-secondary" style="cursor:pointer">
              <span id="upload-avatar-label">Upload Avatar</span>
              <input type="file" accept="image/*" style="display:none" id="avatar-input" x-on:change="window.uploadAvatar($event.target)" data-testid="avatar-input" />
            </label>
            ${v.avatarRemoveBtn}
          </div>
        </div>
${avatarFocusSection(v,)}
        <div class="form-group"><label class="form-label" for="edit-name">Display Name</label><input class="form-input" type="text" id="edit-name" value="${
    escapeHtml(v.name,)
  }" /></div>
        <div class="form-group"><label class="form-label" for="edit-desc">Description</label><textarea class="form-input form-textarea" id="edit-desc" rows="3">${
    escapeHtml(v.desc,)
  }</textarea></div>
        <div class="form-group"><label class="form-label" for="edit-system">System Prompt</label><textarea class="form-input form-textarea" id="edit-system" rows="6">${
    escapeHtml(v.systemPrompt,)
  }</textarea></div>
        <div class="form-group"><label class="form-label" for="edit-personality">Personality</label><textarea class="form-input form-textarea" id="edit-personality" rows="4">${
    escapeHtml(v.personality,)
  }</textarea></div>
        <div class="form-group"><label class="form-label" for="edit-appearance">Appearance</label><textarea class="form-input form-textarea" id="edit-appearance" rows="3">${
    escapeHtml(v.appearance,)
  }</textarea></div>
        <div class="form-group"><label class="form-label" for="edit-outfit">Default Outfit</label><input class="form-input" type="text" id="edit-outfit" value="${
    escapeHtml(v.defaultOutfit,)
  }" /></div>
        <div class="form-group"><label class="form-label" for="edit-greeting">Welcome Message</label><textarea class="form-input form-textarea" id="edit-greeting" rows="4">${
    escapeHtml(v.welcome,)
  }</textarea></div>
        <div class="form-group"><label class="form-label" for="edit-scenario">Scenario</label><textarea class="form-input form-textarea" id="edit-scenario" rows="3">${
    escapeHtml(v.scenario,)
  }</textarea></div>
        <div class="form-group"><label class="form-label" for="edit-example">Example Messages</label><textarea class="form-input form-textarea" id="edit-example" rows="5">${
    escapeHtml(v.mesExample,)
  }</textarea></div>
        <div class="form-group"><label class="form-label" for="edit-post-history">Post-History Instructions</label><textarea class="form-input form-textarea" id="edit-post-history" rows="4">${
    escapeHtml(v.postHistory,)
  }</textarea></div>
        <div class="form-group"><label class="form-label" for="edit-content-rating">Content Rating</label><select class="form-input" id="edit-content-rating">
          <option value="sfw"${v.contentRating === "sfw" ? " selected" : ""}>SFW — Safe</option>
          <option value="nsfw_mild"${v.contentRating === "nsfw_mild" ? " selected" : ""}>Mild</option>
          <option value="nsfw_moderate"${v.contentRating === "nsfw_moderate" ? " selected" : ""}>Moderate</option>
          <option value="nsfw_intense"${v.contentRating === "nsfw_intense" ? " selected" : ""}>Intense</option>
          <option value="nsfw_extreme"${v.contentRating === "nsfw_extreme" ? " selected" : ""}>Extreme</option>
        </select>
        <p class="form-hint" style="color:var(--text-secondary)">Maximum explicit content this character may produce. Gated by your account&rsquo;s NSFW preference.</p></div>
${extensionEditorSection(v.characterId, loadPanelBody, escapeAttr,)}
${INTERNAL_TRAITS_SECTION}
${
    growthSection(
      {
        characterId: v.characterId,
        growthMode: v.growthMode,
        llmAssistEnabled: v.llmAssistEnabled,
        arcStage: v.arcStage,
        arcDescription: v.arcDescription,
        dataVersion: v.dataVersion,
        recentEntries: v.recentEntries,
      },
      escapeAttr,
    )
  }
${PROACTIVE_SECTION}
${journalKeyphraseSection(v.characterId, escapeAttr, nonceAttr,)}
${panelsSection(v.characterId, loadPanelBody, escapeAttr,)}
        <div style="display:flex;gap:var(--space-3);justify-content:flex-end;margin-top:var(--space-6)">
          <a href="/views/characters" class="btn btn-secondary" data-testid="cancel-edit-character">Cancel</a>
          <button type="button" class="btn btn-primary" x-on:click="window.saveCharacterEdit('${
    escapeAttr(v.characterId,)
  }')" data-testid="save-character-btn">Save Character</button>
      </form>
      <script${nonceAttr}>
        (async () => {
          if (typeof globalThis.updateAvatarFocusPreview === 'function') { globalThis.updateAvatarFocusPreview(); }
          if (typeof globalThis.loadInternalTraits === 'function') { await globalThis.loadInternalTraits('${
    escapeAttr(v.characterId,)
  }'); }
          if (typeof globalThis.loadProactiveConfig === 'function') { await globalThis.loadProactiveConfig('${
    escapeAttr(v.characterId,)
  }'); }
        })();
      </script>
    </div>`;
}
