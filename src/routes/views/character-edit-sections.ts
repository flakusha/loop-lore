// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Collapsible edit-form sections — internal traits + proactive messaging.
 *
 * Split from ./character-edit-form.ts to stay under the size gate. Both
 * are static HTML constants (no interpolation) rendered verbatim in
 * `buildEditFormHtml`; the FE hydrates their controls after load.
 */

/** Collapsible Internal Traits section HTML */
export const INTERNAL_TRAITS_SECTION = `
        <details class="form-section" data-testid="internal-traits-section" style="margin-top:var(--space-6);border:1px solid var(--border-default);border-radius:var(--radius-md);padding:var(--space-4)">
          <summary style="cursor:pointer;font-weight:600;font-size:var(--text-lg)">Internal Traits &amp; Personality Depth</summary>
          <p class="form-hint" style="color:var(--text-secondary);margin:var(--space-2) 0 var(--space-4)">Hidden inner state that shapes how this character thinks, feels, and acts. Not visible to players unless marked open.</p>
          <div class="form-group">
            <label class="form-label">Aspirations</label>
            <div id="aspirations-list" data-testid="aspirations-list"></div>
            <button type="button" class="btn btn-secondary btn-sm" x-on:click="window.addAspiration()" style="margin-top:var(--space-2)" data-testid="add-aspiration">+ Add Aspiration</button>
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
export const PROACTIVE_SECTION = `
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
