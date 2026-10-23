<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# FEAT: message translations chat-first

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** output-control-transforms
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Wire the migrated-but-unread `message_translations` table into a chat-first
message-translation consumer under `epic-output-control-transforms`.
Backend: schema delivered via the **DB Migration Compaction (Path B)**
final form (`epic-db-migration-compaction.md`) — `message_translations`
created in final form carrying `UNIQUE (message_id, locale)` for
idempotent upsert retranslation, the encryption columns mirroring
`messages` (see Caveats), and optional `status` (`complete|rejected`)
or `source_lang`; documented fallback if compaction has not landed when
implementation starts: append-only migration per current policy. Plus a
service `src/chat/message-translations.ts` reusing
`buildTranslateDeps` (`src/chat/auto-translate.ts`) +
`resolveTranslatorRole` (`src/generation/translator-role.ts`), a post-store
fire-and-forget generation step (`src/generation/auto-gen/post-store.ts`) +
migration of the rule-based reply path (`src/routes/messages/reply.ts`) —
decided full migration: the reply writes the ORIGINAL and triggers the
translation step instead of replacing stored content — and
GET/POST `/api/messages/:id/translations` routes mirroring the variants
pattern (`src/routes/messages/read.ts`), with validation schemas beside
`MessageVariantQuery`.

**Context:**

`ModelRole.Translator` is fully first-class (enum, config
`generation.modelRoles.translator`, env map, DB override + admin REST,
`resolveTranslatorRole` general-fallback). The `message_translations` table
is migrated (`src/db/schema-core.ts` `MessageTranslations`) but has zero
production readers/writers — it is a dangling schema awaiting exactly this
feature. Placement rule: post-store, additive, fire-and-forget with
`.catch(logger.warn)` — translation is never a content hook and never gates
or suppresses generation (`runHookChain` is a gating chain; translation must
not join it). Read routes reuse the variants-pattern access gates
(`checkChatAccess` / parent re-authorization) and 404 (never 403-leak) per
repo convention.

Translation trigger — **decided (owner, 2026-10-23; amended by
FEAT-model-native-locale-config)**: eager translation iff the effective
*model native locale* differs from the resolved display locale. The
effective model native locale resolves
`model_capabilities.native_locale` → provider config `locale` → chat
`gm_config.contentLanguage` assumption → `en` — the chat field alone is
**not** the comparator anymore; it is only the third rung of the native-
locale chain. The display locale is the message-level request param or
the user's `contentLocale` setting, resolved via the single precedence
resolver (`resolveTranslationTarget`). Otherwise lazy — no immediate
translation. Per-message `POST /api/messages/:id/translations` stays
the on-demand path either way. Edge cases: display locale equal to the
effective native locale → write no row; unknown locale → rejected at
the service boundary (LOCALE_REGISTRY); never a second ad-hoc chain.

In-place outbound auto-translate fate — **decided (owner, 2026-10-23):
option (b) full migration**. The original is always the persisted
message row; every translation — the legacy per-chat target included —
becomes a `message_translations` variant row. The rule-based reply path
(`reply.ts`) stops replacing stored content (`assistantContent =
outbound.text` at `:123` goes away): it writes the original and fires
the translation step instead. Historical translated-only rows are
documented as non-backfillable — the original text was never stored and
is not recoverable.

Remaining open questions for the owner (do not resolve unilaterally):
- Adopt the publication guard (`status complete|rejected` + pinned-term
  containment) for chat messages now, or plain v1 (row-or-no-row)?
- Auto-drop stale translations on message edit (`edited_at`/`row_version`
  exist), or serve with a staleness note?
- DeepL/LibreTranslate-class providers in scope, or v1 boundary = any
  OpenAI-compatible/Ollama translation-tuned model?

**Caveats:**

- **Failure semantics (additive guarantee)**: the original message is
  inserted and committed first; translation runs strictly after; any
  failure (role unset, LLM error, DB error) writes no row and never
  touches the response. **Provider-unregistered → skip + warn** (the
  `/translate` policy) — never silently re-route to the general model.
- **Encryption — decided (owner, 2026-10-23)**: `message_translations`
  content follows the same encryption logic as original message content —
  access + encryption-setup dependent, mirroring `messages`. The
  migration must add the columns needed to mirror the messages table
  (`src/db/migrations/001_init.ts:1856-1893`, `src/db/schema-core.ts`
  `Messages:773-818`): `key_id TEXT` (chat-keys reference, nullable),
  `content_encoding TEXT` (default `identity`), `e2e_payload TEXT`,
  `e2e_session_id TEXT` (FK `e2e_sessions.id` ON DELETE SET NULL),
  `e2e_sender_eph_pub_jwk TEXT`, `e2e_chain_index INTEGER`, and
  `content_plaintext TEXT` (the FTS/searchable form — `messages_fts`
  triggers index `content_plaintext`). The service encrypts/decrypts via
  the same path as message content (`encryptMessageContent` pipeline,
  `isEncryptionEnabled()` gate — cf. `reply.ts:129-145`).
- **TOCTOU / authz**: read/write routes must re-authorize chat access at
  serve time (parent re-check like the variants routes), not trust the id;
  unknown locale codes rejected at the service boundary against
  `LOCALE_REGISTRY`.
- **Partial failure / idempotency**: UNIQUE `(message_id, locale)` makes
  retranslation an upsert; concurrent double-trigger must not duplicate
  rows. No locale column exists on `messages` — the translation row is the
  only locale carrier.
- **Rollback**: schema change is additive (compaction final form, or an
  append-only migration if compaction has not landed; SQLite
  one-alter-per-statement in that fallback); rollback = stop calling the
  service; existing rows are inert.

**Acceptance Criteria:**

- [ ] `message_translations` final-form shape (UNIQUE
      `(message_id, locale)`, optional `status`/`source_lang`,
      encryption columns mirroring `messages`) delivered — via the
      compaction final form when it has landed, else an append-only
      migration per current policy; `db:sync-types` /
      `db:sync-manifest` pass
- [ ] `src/chat/message-translations.ts` service reuses
      `buildTranslateDeps` + `resolveTranslatorRole`; unregistered provider
      → skip + warn, no general-model substitution; content
      encrypted/decrypted via the same path as message content
- [ ] Eager trigger fires only when the resolved display locale differs
      from the effective model native locale
      (`native_locale` → provider `locale` → chat contentLanguage →
      `en`, per `FEAT-model-native-locale-config`); equal locale writes
      no row
- [ ] Rule-based reply path stores the ORIGINAL content (no in-place
      replacement) and triggers the translation variant step; historical
      translated-only rows documented as non-backfillable
- [ ] Post-store step + rule-based reply path both fire-and-forget; a
      translation failure never fails or delays the message response
- [ ] GET list / GET by locale / POST on-demand routes mounted with
      variants-equivalent access gates and 404 (not 403) on foreign ids
- [ ] Validation schemas reject unknown locales against `LOCALE_REGISTRY`
