// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character Edit Form — HTML template builder
 *
 * Extracted from characters.ts to stay under size gate.
 * Called by serveCharacterEditForm after loading the actor from DB.
 */

/** Input values for the edit form */
export interface EditFormValues {
  name: string;
  desc: string;
  systemPrompt: string;
  personality: string;
  welcome: string;
  scenario: string;
  mesExample: string;
  postHistory: string;
  avatarHtml: string;
  avatarId: string;
  avatarRemoveBtn: string;
  characterId: string;
  /** 5-tier NSFW content rating (sfw | nsfw_mild | nsfw_moderate | nsfw_intense | nsfw_extreme). */
  contentRating: string;
}

/** Collapsible Internal Traits section HTML */
const INTERNAL_TRAITS_SECTION = `
        <details class="form-section" data-testid="internal-traits-section" style="margin-top:var(--space-6);border:1px solid var(--border-default);border-radius:var(--radius-md);padding:var(--space-4)">
          <summary style="cursor:pointer;font-weight:600;font-size:var(--text-lg)">Internal Traits &amp; Personality Depth</summary>
          <p class="form-hint" style="color:var(--text-secondary);margin:var(--space-2) 0 var(--space-4)">Hidden inner state that shapes how this character thinks, feels, and acts. Not visible to players unless marked open.</p>
          <div class="form-group">
            <label class="form-label">Aspirations</label>
            <div id="aspirations-list" data-testid="aspirations-list"></div>
            <button type="button" class="btn btn-secondary btn-sm" onclick="addAspiration()" style="margin-top:var(--space-2)" data-testid="add-aspiration">+ Add Aspiration</button>
          </div>
          <div class="form-group">
            <label class="form-label">Moral Disposition</label>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4)">
              <div><label class="form-label" for="moral-lawful" style="font-size:var(--text-sm)">Lawful &larr;&rarr; Chaotic</label><input type="range" id="moral-lawful" min="-1" max="1" step="0.1" value="0" style="width:100%" /><span id="moral-lawful-val" style="font-size:var(--text-xs);color:var(--text-secondary)">0</span></div>
              <div><label class="form-label" for="moral-good" style="font-size:var(--text-sm)">Good &larr;&rarr; Evil</label><input type="range" id="moral-good" min="-1" max="1" step="0.1" value="0" style="width:100%" /><span id="moral-good-val" style="font-size:var(--text-xs);color:var(--text-secondary)">0</span></div>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Autonomy Preferences</label>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4)">
              <div><label class="form-label" for="auto-group" style="font-size:var(--text-sm)">Group Comfort</label><input type="range" id="auto-group" min="0" max="1" step="0.1" value="0.5" style="width:100%" /><span id="auto-group-val" style="font-size:var(--text-xs);color:var(--text-secondary)">0.5</span></div>
              <div><label class="form-label" for="auto-solo" style="font-size:var(--text-sm)">Solo Comfort</label><input type="range" id="auto-solo" min="0" max="1" step="0.1" value="0.5" style="width:100%" /><span id="auto-solo-val" style="font-size:var(--text-xs);color:var(--text-secondary)">0.5</span></div>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Coping Mechanisms</label>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:var(--space-3)">
              <div><label class="form-label" for="cope-stress" style="font-size:var(--text-sm)">Stress Response</label><input class="form-input" type="text" id="cope-stress" placeholder="e.g. withdraw, fight" /></div>
              <div><label class="form-label" for="cope-failure" style="font-size:var(--text-sm)">Failure Response</label><input class="form-input" type="text" id="cope-failure" placeholder="e.g. persist, blame" /></div>
              <div><label class="form-label" for="cope-conflict" style="font-size:var(--text-sm)">Conflict Style</label><input class="form-input" type="text" id="cope-conflict" placeholder="e.g. avoid, confront" /></div>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Approach Tendencies</label>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:var(--space-3)">
              <div><label class="form-label" for="approach-decision" style="font-size:var(--text-sm)">Decision Style</label><input class="form-input" type="text" id="approach-decision" placeholder="e.g. analytical, impulsive" /></div>
              <div><label class="form-label" for="approach-risk" style="font-size:var(--text-sm)">Risk Tolerance</label><input type="range" id="approach-risk" min="0" max="1" step="0.1" value="0.5" style="width:100%" /><span id="approach-risk-val" style="font-size:var(--text-xs);color:var(--text-secondary)">0.5</span></div>
              <div><label class="form-label" for="approach-initiative" style="font-size:var(--text-sm)">Initiative Level</label><input type="range" id="approach-initiative" min="0" max="1" step="0.1" value="0.5" style="width:100%" /><span id="approach-initiative-val" style="font-size:var(--text-xs);color:var(--text-secondary)">0.5</span></div>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Voice Patterns</label>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3)">
              <div><label class="form-label" for="voice-tics" style="font-size:var(--text-sm)">Verbal Tics</label><input class="form-input" type="text" id="voice-tics" placeholder="comma-separated: hmm, well, you know" /></div>
              <div><label class="form-label" for="voice-vocab" style="font-size:var(--text-sm)">Vocabulary Level</label><input class="form-input" type="text" id="voice-vocab" placeholder="e.g. casual, formal, archaic" /></div>
              <div><label class="form-label" for="voice-structure" style="font-size:var(--text-sm)">Sentence Structure</label><input class="form-input" type="text" id="voice-structure" placeholder="e.g. short, flowing, fragmented" /></div>
              <div><label class="form-label" for="voice-humor" style="font-size:var(--text-sm)">Humor Style</label><input class="form-input" type="text" id="voice-humor" placeholder="e.g. dry, sarcastic, playful" /></div>
            </div>
            <div style="margin-top:var(--space-3)"><label class="form-label" for="voice-emotional" style="font-size:var(--text-sm)">Emotional Range</label><input type="range" id="voice-emotional" min="0" max="1" step="0.1" value="0.5" style="width:200px" /><span id="voice-emotional-val" style="font-size:var(--text-xs);color:var(--text-secondary);margin-left:var(--space-2)">0.5</span></div>
          </div>
          <div id="traits-status" style="font-size:var(--text-sm);color:var(--text-secondary);margin-top:var(--space-2)"></div>
        </details>`;

/** Collapsible Proactive Messaging section HTML */
const PROACTIVE_SECTION = `
        <details class="form-section" data-testid="proactive-messaging-section" style="margin-top:var(--space-4);border:1px solid var(--border-default);border-radius:var(--radius-md);padding:var(--space-4)">
          <summary style="cursor:pointer;font-weight:600;font-size:var(--text-lg)">Proactive Messaging</summary>
          <p class="form-hint" style="color:var(--text-secondary);margin:var(--space-2) 0 var(--space-4)">Control when this character can message the user first. Requires an active chat.</p>
          <div class="form-group">
            <label class="form-label" for="proactive-frequency">Frequency</label>
            <select class="form-input" id="proactive-frequency">
              <option value="infrequent">Infrequent &mdash; rare check-ins</option>
              <option value="normal" selected>Normal &mdash; balanced pacing</option>
              <option value="frequent">Frequent &mdash; more proactive</option>
              <option value="very_frequent">Very Frequent &mdash; high engagement</option>
            </select>
          </div>
          <div class="form-group" style="display:flex;align-items:center;gap:var(--space-3)">
            <input type="checkbox" id="proactive-enabled" checked />
            <label class="form-label" for="proactive-enabled" style="margin:0">Enabled</label>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4)">
            <div class="form-group"><label class="form-label" for="proactive-quiet-start">Quiet Hours Start</label><input class="form-input" type="time" id="proactive-quiet-start" value="23:00" /></div>
            <div class="form-group"><label class="form-label" for="proactive-quiet-end">Quiet Hours End</label><input class="form-input" type="time" id="proactive-quiet-end" value="08:00" /></div>
          </div>
          <div id="proactive-status" style="font-size:var(--text-sm);color:var(--text-secondary);margin-top:var(--space-2)"></div>
        </details>`;

/**
 * Build the full character edit form HTML.
 * Called by serveCharacterEditForm after DB lookup.
 */
export function buildEditFormHtml(v: EditFormValues,): string {
  return `<div style="max-width:720px;margin:0 auto;width:100%">
      <form id="char-edit-form" data-testid="character-edit-form">
        <div class="form-group" style="display:flex;align-items:flex-start;gap:var(--space-4)">
          <div style="width:80px;height:80px;border-radius:var(--radius-md);background:var(--bg-tertiary);display:flex;align-items:center;justify-content:center;font-size:36px;flex-shrink:0;overflow:hidden;border:1px solid var(--border-default)">
            <div id="avatar-preview">${v.avatarHtml}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:var(--space-2)">
            <label class="btn btn-secondary" style="cursor:pointer">
              <span id="upload-avatar-label">Upload Avatar</span>
              <input type="file" accept="image/*" style="display:none" id="avatar-input" onchange="uploadAvatar(this)" />
            </label>
            ${v.avatarRemoveBtn}
          </div>
        </div>
        <div class="form-group"><label class="form-label" for="edit-name">Display Name</label><input class="form-input" type="text" id="edit-name" value="${v.name}" /></div>
        <div class="form-group"><label class="form-label" for="edit-desc">Description</label><textarea class="form-input form-textarea" id="edit-desc" rows="3">${v.desc}</textarea></div>
        <div class="form-group"><label class="form-label" for="edit-system">System Prompt</label><textarea class="form-input form-textarea" id="edit-system" rows="6">${v.systemPrompt}</textarea></div>
        <div class="form-group"><label class="form-label" for="edit-personality">Personality</label><textarea class="form-input form-textarea" id="edit-personality" rows="4">${v.personality}</textarea></div>
        <div class="form-group"><label class="form-label" for="edit-greeting">Welcome Message</label><textarea class="form-input form-textarea" id="edit-greeting" rows="4">${v.welcome}</textarea></div>
        <div class="form-group"><label class="form-label" for="edit-scenario">Scenario</label><textarea class="form-input form-textarea" id="edit-scenario" rows="3">${v.scenario}</textarea></div>
        <div class="form-group"><label class="form-label" for="edit-example">Example Messages</label><textarea class="form-input form-textarea" id="edit-example" rows="5">${v.mesExample}</textarea></div>
        <div class="form-group"><label class="form-label" for="edit-post-history">Post-History Instructions</label><textarea class="form-input form-textarea" id="edit-post-history" rows="4">${v.postHistory}</textarea></div>
        <div class="form-group"><label class="form-label" for="edit-content-rating">Content Rating</label><select class="form-input" id="edit-content-rating">
          <option value="sfw"${v.contentRating === "sfw" ? " selected" : ""}>SFW — Safe</option>
          <option value="nsfw_mild"${v.contentRating === "nsfw_mild" ? " selected" : ""}>Mild</option>
          <option value="nsfw_moderate"${v.contentRating === "nsfw_moderate" ? " selected" : ""}>Moderate</option>
          <option value="nsfw_intense"${v.contentRating === "nsfw_intense" ? " selected" : ""}>Intense</option>
          <option value="nsfw_extreme"${v.contentRating === "nsfw_extreme" ? " selected" : ""}>Extreme</option>
        </select>
        <p class="form-hint" style="color:var(--text-secondary)">Maximum explicit content this character may produce. Gated by your account&rsquo;s NSFW preference.</p></div>
        <input type="hidden" id="char-avatar-id" value="${v.avatarId}" />
${INTERNAL_TRAITS_SECTION}
${PROACTIVE_SECTION}
        <div style="display:flex;gap:var(--space-3);justify-content:flex-end;margin-top:var(--space-6)">
          <a href="/views/characters" class="btn btn-secondary" data-testid="cancel-edit-character">Cancel</a>
          <button type="button" class="btn btn-primary" onclick="saveCharacterEdit('${v.characterId}')" data-testid="save-character-btn">Save Character</button>
        </div>
      </form>
      <script>
        (async () => {
          if (typeof globalThis.loadInternalTraits === 'function') { await globalThis.loadInternalTraits('${v.characterId}'); }
          if (typeof globalThis.loadProactiveConfig === 'function') { await globalThis.loadProactiveConfig('${v.characterId}'); }
        })();
      </script>
    </div>`;
}
