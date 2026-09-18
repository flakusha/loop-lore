<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Per-chat auto-translation layer

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ✅ Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-output-control-transforms

## Summary

Add per-chat targetLang setting; auto-translate inbound/outbound messages through the /translate LLM pattern. Covers epic-output-control-transforms ideas #7. Needs design for language detection and opt-out.

Related: TASK-auto-translation-layer.md (stub; this ticket is the actionable per-chat refinement).

## Acceptance Criteria

- [x] Implementation complete (`src/chat/auto-translate.ts` — per-chat targetLang in `chats.story_state.autoTranslateLang`, no migration)
- [x] Tests passing (`src/chat/auto-translate.test.ts` — 18 tests green: opt-out default, skip-when-same-language, failure passthrough, targetLang roundtrip, plus strict-review regressions below)
- [x] Documentation updated (hook points + en.json keys + route-registration line in ## Resolution below)

## Resolution

- Storage: existing `chats.story_state` JSON key `autoTranslateLang` (checked `src/chat/service/crud/create.ts` + `migrations/parts/006_chat.ts` — no settings column exists; `story_state` already carries per-chat JSON like `isPaused`). No migration.
- Reuses `runTranslate` + `LANGUAGES` from `src/assistant/commands/translate.ts`; failures degrade to untranslated original, never block send.
- Skip heuristic only (never auto-detect without consent): blank / letterless text, or text already in a non-Latin target script (ja/zh/ko/ru/ar) with no Latin letters. Latin targets always translate.
- Hook points (wired — chat-batch-3):
  - Inbound: `src/routes/messages/create.ts` calls `translateInboundContent(...)` (`src/routes/messages/translate-inbound.ts`) after slash-command dispatch; translated text feeds `prepareContentStorage`.
  - Outbound: `src/routes/messages/reply.ts` in `maybeAutoReply` translates `assistantContent` via `autoTranslateText` + `buildTranslateDeps` before encrypt/persist; the translated text is also echoed in the response.
  - Setting endpoint `src/routes/chats/auto-translate.ts` (mounted in `src/routes/chats/index.ts`): `PATCH /api/chats/:id/auto-translate { targetLang }` (400 on unknown code) + `DELETE` to clear; creator/owner/GM-gated via `checkChatSettingsAccess`.
  - Deps builder `buildTranslateDeps` (`src/chat/auto-translate.ts`) resolves the LLM `complete` via `resolveProvider`; empty deps (heuristic path) degrade to untranslated, never reject.
- Strict self-review (verified against real implementations, not intent): (1) `resolveTargetLang("null")` crashed on `null[KEY]` — fixed with object/null guard, regression-tested; (2) catch-path `getLogger()` throws when uninitialized (`src/logger/index.ts:38`), which would have made the degrade path reject — removed the logger dependency, failure is signaled via the outcome for the caller to log; (3) suspected `runTranslate` `to`-misparse on text containing "to" — disproven: the two-element `[targetLang, text]` construction always takes the `<lang> <text>` branch (branch 3 unreachable), pinned by a regression test; (4) `autoTranslateLang` key collision search: no existing user. Missing-`complete` (LLM unwired) degrades via the `fallback:true` payload — tested.
- en.json keys for Main to add under `autoTranslate.*`: `autoTranslate.label` ("Auto-translate"), `autoTranslate.targetLanguage` ("Target language"), `autoTranslate.off` ("Off"), `autoTranslate.translatedFrom` ("Translated from {lang}"), `autoTranslate.unsupportedLanguage` ("Unsupported language: {code}").
