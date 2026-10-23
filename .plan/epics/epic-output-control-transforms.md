<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Prompt & Output Control

**Effort:** Medium
**Type:** epic
**Tags:** llm, streaming, i18n, frontend
**Overview:** (see sections below)


**Status:** Not Started
**Status Note:** Not Started
**Priority:** Medium
**Plan.md:** §51
**Issue:** `EPIC-2026-38`

## Summary

Regex output transforms, smart-regen, prompt library, lore-consistency checker, auto-translation.

## Tasks

| Task                                     | Files                                 | Effort | Source      |
| ---------------------------------------- | ------------------------------------- | ------ | ----------- |
| Regex output transforms (post-gen)       | `src/generation/transforms.ts` (new)  | Low    | plan.md §51 |
| Filter-stage transform pipeline (inlet/request/stream/outlet + priority) | `src/generation/transforms.ts` | Med | OWUI Filter |
| Smart-regen polish (partial message fix) | `src/generation/smart-regen.ts` (new) | Med    | plan.md §51 |
| Prompt library (save/reuse templates)    | `src/routes/prompts.ts` (new)         | Med    | plan.md §51 |
| Lore-consistency checker                 | `src/lorebook/consistency.ts` (new)   | High   | plan.md §51 |
| Regex output transforms (render-time)    | `src/frontend/render-transforms.ts` (outlet + stream contract, see below) | Low | ideas #6 |
| Chat-first auto-translation layer            | `src/chat/auto-translate.ts`          | Med    | ideas #7    |
| Smart-regen style rewrites               | `src/generation/smart-regen.ts`       | Low    | ideas #8    |
| Prompt-template marketplace              | `src/routes/marketplace.ts` (new)     | Med    | ideas #9    |

## Ideas Merged

- `docs/ideas/prompt-output-control.md` — ideas #6 (regex transforms), #7 (auto-translation), #8 (smart-regen), #9 (prompt marketplace)

### Transform stage contract (OWUI Filter pattern)

Stages: `inlet(body)->body` once per turn (sanitize, inject context); `request(body)->body` every provider call, must be idempotent; `stream(event)->event` per-chunk rewrite (censor); `outlet(body)->body` full-body rewrite (cite, disclaimer, log). Ordering via `priority` (lower runs first). Abort/soft-fail matrix: raising from stream/outlet/request aborts the completion; inlet failures stay soft (log + continue).

## Dependencies

- Assistant command parser (`docs/spec/assistant-commands.md`) for smart-regen
- i18n (`docs/frontend/internationalization.md`) for auto-translation
- Export/share infra (`docs/frontend/chat/export.md`) for marketplace
- Plugin registry for marketplace versioning

### Idempotency guard (from request-stage)

Request-stage transforms must be idempotent: guard append/prepend/increment with a marker check (skip if marker content already present); naturally-idempotent ops (clamp, redact-no-match) need no guard. Unit test: a 3-tool-call turn yields one insertion, not three.

## Linked Tasks

- TASK-output-control-transforms.md
- FEAT-message-translations-chat-first.md
- FEAT-language-selection-three-level.md
- FEAT-model-native-locale-config.md

## Chat-first message translations (pending)

The translator role is already first-class: `ModelRole.Translator`
(`src/db/enums-core/flags.ts`), config `generation.modelRoles.translator`,
env mapping (`LLM_TRANSLATOR_PROVIDER`/`_MODEL`), DB override + admin REST
(`VALID_ROLES` includes translator), and a dedicated resolver
`resolveTranslatorRole` (`src/generation/translator-role.ts`) with a
general-fallback + provenance contract callers must not re-implement.
Consumers shipped today: `/translate` command
(`src/assistant/commands/translate.ts`) and per-chat auto-translate
(`src/chat/auto-translate.ts`).

The `message_translations` table is fully migrated
(`src/db/schema-core.ts` `MessageTranslations`) but has **zero production
readers/writers** — a dangling schema awaiting its consumer.

Plan (see `FEAT-message-translations-chat-first.md`):

- **Post-store generation step** — after the assistant message row is
  committed, translate additively: fire-and-forget, `.catch(logger.warn)`,
  never a content hook, never gates or suppresses output. The original
  always persists first; provider-unregistered → skip + warn (never
  silently re-route to the general model).
- **Routes** mirroring the variants pattern:
  `GET /api/messages/:id/translations` (+ `/:locale`) and
  `POST /api/messages/:id/translations { locale }` for on-demand lazy
  translation, with the same access gates.
- **One append-only migration**: `UNIQUE (message_id, locale)` for
  idempotent upsert retranslation, plus optional `status`
  (`complete|rejected`) and `source_lang` columns.
- Language targeting spans user / chat / message levels with
  server-enforced precedence — see
  `FEAT-language-selection-three-level.md`.

Open questions (owner): eager vs lazy translation; fate of in-place
outbound auto-translate (`reply.ts` replaces stored content); encryption of
`message_translations.content` (plaintext vs `key_id`); publication-guard
adoption; stale-translation invalidation on edit.

**Decisions (owner, 2026-10-23):** eager translation iff the resolved
display locale (message request or user `contentLocale`) differs from the
effective **model native locale** —
`model_capabilities.native_locale` → provider config `locale` → chat
`gm_config.contentLanguage` assumption → `en` (see
`FEAT-model-native-locale-config.md`; the LLM locale is the third leg
beside chat language and display locale); otherwise lazy, `POST
/translations` stays the on-demand path. `message_translations` content
follows the same encryption logic as original message content (migration
mirrors the `messages` encryption columns; service uses the
`encryptMessageContent` path). Schema delivery (translations table and
`model_capabilities.native_locale`) rides the DB Migration Compaction
epic's final form (`epic-db-migration-compaction.md`), with an
append-only fallback while it has not landed. In-place outbound fate and pack tag
authority remain proposals in the tickets — see
`FEAT-message-translations-chat-first.md` and
`FEAT-language-selection-three-level.md`.

## Security Considerations

- **Marker check then insert is check-then-act; a 3-call turn inserts the marker three times** → idempotency key per (messageId, stage, marker) (src/generation/transforms.ts)
- **Community transform plugin named like a builtin overwrites the builtin slot** → name-origin validation at load (src/plugins/registry.ts:33-37)

## Related Epics

- `epic-frontend-chat-commands.md` — related
- `epic-i18n.md` — related
- `epic-plugin-system.md` — related
