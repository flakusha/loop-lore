// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Journal Keyphrases section — character edit form (TASK-KEYPHRASE-RECALL).
 *
 * The frontend module `pages/characters-journal-keyphrases.ts` hydrates
 * `#journal-keyphrase-list` with the character's journal entries (actor
 * memories) and saves edited keyphrase lists back via the memories CRUD API.
 */

/**
 * @param characterId - actor id passed to the inline init script
 * @param escapeAttr - attribute escaper shared with the form builder
 * @param nonceAttr - CSP nonce attribute for the inline script ("" in tests)
 * @returns the section HTML
 */
export function journalKeyphraseSection(
  characterId: string,
  escapeAttr: (str: string,) => string,
  nonceAttr: string,
): string {
  return `        <details class="form-section" data-testid="journal-keyphrase-section" style="margin-top:var(--space-6);border:1px solid var(--border-default);border-radius:var(--radius-md);padding:var(--space-4)">
          <summary style="cursor:pointer;font-weight:600;font-size:var(--text-lg)">{{{ t("journalKeyphrases.title") }}}</summary>
          <p class="form-hint" style="color:var(--text-secondary);margin:var(--space-2) 0 var(--space-4)">
            {{{ t("journalKeyphrases.hint") }}}
          </p>
          <div id="journal-keyphrase-list" data-testid="journal-keyphrase-list">
            <span style="color:var(--text-secondary);font-size:var(--text-sm)">{{{ t("journalKeyphrases.loading") }}}</span>
          </div>
          <script${nonceAttr}>
            if (typeof globalThis.initJournalKeyphrases === 'function') { globalThis.initJournalKeyphrases('${
    escapeAttr(characterId,)
  }'); }
          </script>
        </details>`;
}
