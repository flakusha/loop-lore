// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Collapsible actor sub-resource panels (licensing, notes/items/lore,
 * systems, traits, emotion avatars).
 *
 * Each wrapper binds its own Alpine factory; the outer x-data provides
 * actorId. Panel bodies are inlined from `src/components/character/`
 * (single source of truth — the same files served at
 * `/partials/character/*`). Rendered in the character edit form just
 * before the action footer.
 * @param characterId - actor id interpolated into the panel wrapper
 * @param loadBody - panel template loader (filename to inner body HTML)
 * @param escapeAttr - attribute escaper for the actor id
 * @returns the panels section HTML
 */
export function panelsSection(
  characterId: string,
  loadBody: (file: string,) => string,
  escapeAttr: (str: string,) => string,
): string {
  return `        <details class="form-section" data-testid="actor-panels-section" style="margin-top:var(--space-4);border:1px solid var(--border-default);border-radius:var(--radius-md);padding:var(--space-4)">
          <summary style="cursor:pointer;font-weight:600;font-size:var(--text-lg)">Sub-resources</summary>
          <p class="form-hint" style="color:var(--text-secondary);margin:var(--space-2) 0 var(--space-4)">Licensing, notes / items / lore entries, systems export, permanent traits, and emotion avatar batch jobs.</p>
          <div x-data="{ actorId: '${escapeAttr(characterId,)}' }">
            <section x-data="actorLicensingFactory(actorId)" data-testid="character-licensing">${
    loadBody("licensing-panel.html",)
  }</section>
            <section x-data="actorEntitiesFactory(actorId, 'notes')" data-testid="character-notes" style="margin-top:var(--space-4)">${
    loadBody("entities-panel.html",)
  }</section>
            <section x-data="actorEntitiesFactory(actorId, 'items')" data-testid="character-items" style="margin-top:var(--space-4)">${
    loadBody("entities-panel.html",)
  }</section>
            <section x-data="actorEntitiesFactory(actorId, 'lore-entries')" data-testid="character-lore" style="margin-top:var(--space-4)">${
    loadBody("entities-panel.html",)
  }</section>
            <section x-data="actorSystemsFactory(actorId)" data-testid="character-systems" style="margin-top:var(--space-4)">${
    loadBody("systems-panel.html",)
  }</section>
            <section x-data="actorTraitsFactory(actorId)" data-testid="character-traits" style="margin-top:var(--space-4)">${
    loadBody("traits-panel.html",)
  }</section>
            <section x-data="actorEmotionAvatarsFactory(actorId)" data-testid="character-emotion-avatars" style="margin-top:var(--space-4)">${
    loadBody("emotion-avatars-panel.html",)
  }</section>
          </div>
        </details>`;
}
