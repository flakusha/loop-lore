<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# FEAT: language selection three-level

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** output-control-transforms
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Language selection visible and enforced at three levels with server-side
precedence: **user** (`users.settings.contentLocale` + validation against
`LOCALE_REGISTRY` on `PATCH /api/users/me/settings`), **chat** (single `gm_config.contentLanguage` content-language field —
what the general LLM is directed to respond in AND the translation
anchor/source-locale assumption; prompt section mirrors
`src/generation/prompt/sections/carriage.ts` — plus a chat-settings-modal
control; shipped `story_state.autoTranslateLang` becomes a read-through
fallback and the auto-translate endpoint an alias, see Context), and
**message** (per-message
translate control in `message-list.html` driving the
`FEAT-message-translations-chat-first` routes). Precedence
**message > chat > user > UI-locale cookie** is resolved in ONE server
module (`resolveTranslationTarget`) — mirror the single-owner rule of
`translator-role.ts` ("callers must not re-implement"). Includes the
`messages.translate*` i18n keys across all 10 `src/public/locales/*.json`.

**Context:**

The translator role and message-translation plumbing exist, but language
target selection is scattered: per-chat `autoTranslateLang` (shipped), no
persisted per-user content-locale preference (no `locale` column on
`users`; `users.settings` JSON makes this migration-free), and the UI-locale
chain (`ll_locale` cookie → Accept-Language → default in
`src/middleware/i18n.ts`) is UI-strings-scoped by design
(`epic-publication-i18n.md`: the i18n system "does not translate a word of
user content"). A separate content/translation-language select goes beside
the existing UI-locale switcher in the settings view. The `gm_config.outputLanguage`
prompt section injects exactly the way `assistantPersonality` does (binding
read from `chat.gm_config`, malformed/absent tolerated) — EN/ZH-native
models comply natively; others fall through to the translator-role
post-generation step.

**Chat content-language field — decided (owner, 2026-10-23): exactly ONE
chat-level config key**, to avoid a language² invariant between generation
target and translation target. The single field means: what the general
LLM is directed to respond in (the `gm_config.outputLanguage` prompt
section) AND the anchor/source-locale assumption for translations (the
eager-trigger comparator and the translator fallback target). Storage key
proposed: `gm_config.contentLanguage` (10-locale catalog code from
`LOCALE_REGISTRY`).

**Compat story (chosen — read-through fallback + endpoint alias):**

- Reads check `gm_config.contentLanguage` first and fall back to the
  shipped `story_state.autoTranslateLang` when the new key is absent —
  no data migration, existing chats keep working.
- `PATCH/DELETE /api/chats/:id/auto-translate`
  (`src/routes/chats/auto-translate.ts` — verified: writes
  `story_state` via `setChatTargetLang`, 400 on unknown codes) is kept
  as an alias that writes the new `gm_config.contentLanguage` key (and
  still clears `autoTranslateLang` so the fallback never disagrees with
  the written value); marked deprecated in its handler docs, removed in
  a later release once the chat-settings-modal control is the only
  writer.
- `shouldSkipTranslation` and the never-auto-detect invariant are
  unchanged.

Open questions for the owner (do not resolve unilaterally):
- Layered read-time negotiation (`translateLocale=auto` list enricher) in
  v1, or only per-message explicit requests?

**Caveats:**

- **Never auto-detect content language to choose a target** — shipped
  invariant (per-chat auto-translate ticket Resolution);
  `shouldSkipTranslation` stays the only content inspector (skip-only,
  never detect).
- **Failures degrade to the original message** — a missing/stale
  translation must never block message rendering; read-side negotiators
  fall back per row.
- **TOCTOU/authz**: user-settings PATCH validates `contentLocale` against
  `LOCALE_REGISTRY` at the boundary; chat-level controls gated by
  `checkChatSettingsAccess` like the existing auto-translate endpoint.
- **UI-locale scoping regression risk**: `ll_locale` must stay
  UI-strings-scoped; the content-locale control must persist to
  `users.settings`, not reuse the cookie as storage (cookie is only the
  final precedence rung).
- **Partial failure / rollback**: settings JSON keys are additive
  (migration-free); prompt section + modal control revert independently;
  no data backfill needed.

**Acceptance Criteria:**

- [ ] `PATCH /api/users/me/settings` accepts + validates
      `contentLocale` against `LOCALE_REGISTRY`; unknown codes rejected
- [ ] `gm_config.contentLanguage` prompt section registered (carriage.ts
      shape) and rendered into assembled prompts; malformed values
      tolerated; `story_state.autoTranslateLang` honored as read-through
      fallback
- [ ] Chat-settings-modal content-language control saves the unified key
      via the existing gm-config PATCH flow; `/auto-translate` endpoint
      kept as deprecated alias writing the new key
- [ ] `resolveTranslationTarget` module is the single precedence resolver
      (message > chat content-language > user > UI-locale cookie) consumed
      by the post-store trigger, POST translations route, and read-side
      negotiation
- [ ] `message-list.html` per-message translate control wired to the
      translation routes; `messages.translate*` keys present in all 10
      locale files
