<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Multilingual Carriage — Hidden Per-Message Language/Context Carriage

**Overview:** (see sections below)

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Type:** Feature Epic
**Tags:** i18n, carriage, classification, prompt-injection, privacy

## Summary

Multilingual chat messages flow through classification, prompt assembly, and
memory today as raw text that every downstream consumer assumes is English.
The translator utility (`/translate` + per-chat auto-translate) exists, but it
is a single-call MT fill mechanism for one namespace — not a pipeline: there
is no detection, no source preservation, and classification/prompt/memory all
still read the raw string. This epic adds a hidden per-message
language/context carriage table roughly shaped like `carriage_records`
(`028_carriage_records.ts:7-39`): `message_id`, detected locale, source-text
reference or hash, classification labels JSON, producer version. The existing
translator role (`src/generation/translator-role.ts:51-65`) becomes the fill
mechanism for one namespace, never the foundation. The read path is
admin-gated and prompt-section-injected like `src/chat/service/carriage.ts`
(`src/chat/service/carriage.ts:90-148`, `src/routes/admin/carriage.ts:8-36`),
never participant-visible.

## Motivation

Verified ground state (2026-10-23):

- **Single-string inbound funnel, no language signal.**
  `src/routes/messages/create.ts:153-154` funnels every message to one raw
  string; nothing records what language it arrived in.
- **Auto-translate destroys the original.**
  `src/chat/auto-translate.ts:124-141` overwrites the message body in place —
  the source text is lost, so no downstream stage can ever see both versions.
- **Classification assumes English.**
  `src/generation/auto-gen/classify-intent.ts:40-43` classifies the raw text
directly; a non-English message is classified on words the classifier was
  never trained to read.
- **`messages.metadata` is the wrong column for hidden carriage.**
  It exists (`src/db/schema-core.ts:773-818`, `001_init.ts:1885`) but is
  nullable free-form text, participant-visible via the `selectAll` + spread
  read path (`src/chat/service/read.ts:29-33,79-93`,
  `src/routes/messages/read.ts:137-144`), and plaintext. Hidden carriage must
  never ride a column that is spread onto the wire.
- **The hidden precedent already ships.**
  `carriage_records` (`028_carriage_records.ts:7-13`) is a dedicated table
  with an admin-gated read path (`src/routes/admin/carriage.ts:8-36`) and
  prompt-section injection (`src/chat/service/carriage.ts:90-148`), never
  participant-visible. This epic copies that shape, not the translator.
- **The dead table is not the answer either.**
  `message_translations` (`src/db/schema-core.ts:761-770`) has no writer and
  no reader — a store with no pipeline on either side. The new table ships
  with both a fill path and a read path from day one.
- **Build-time hashing is not a message precedent.**
  `src/content/hash-injection.ts` is build-time asset hashing; it is not
  cited as a precedent for per-message carriage anywhere in this epic.

## Decision

Hidden per-message language/context carriage following the `carriage_records`
precedent: dedicated table, admin-gated read path, never participant-visible.
The existing translator role (`/translate` + auto-translate +
`translator-role.ts`) is the **fill mechanism for one namespace**, not the
foundation.

**Rejected alternative: translator-model-as-foundation.** The translator is a
viable single-call MT utility but a vapor pipeline — no detection, no source
preservation (`auto-translate.ts:124-141` overwrites), and every consumer
(classification, prompt assembly, memory) still assumes English input.
Building on it would mean bolting hidden state onto a participant-visible
destructive-rewrite path. Instead the translator role stays exactly what it
is — one fill producer writing into carriage — and the table, read path, and
injection section are new, following `carriage_records`.

## Scope

- **Table:** `message_language_carriage`, roughly shaped like
  `carriage_records` (`028_carriage_records.ts:7-39`): `message_id` (FK),
  `detected_locale`, `source_text_ref` or content hash (never a second full
  copy when avoidable), `classification_labels` JSON, `producer_version`.
  Migration mirrors the 028 pattern (dedicated table, FK to messages).
- **Fill path:** detection at write time plus translator-role wiring
  (`src/generation/translator-role.ts:51-65`) **without destroying the
  original** — the explicit contrast with the `auto-translate.ts:124-141`
  overwrite. Detection prefers a lightweight script/CLD-style detector when
  feasible **without a new dependency**; otherwise it rides behind the
  existing LLM call.
- **Read path:** admin-gated (mirror `src/routes/admin/carriage.ts:8-36`)
  with key-scoped fail-closed readers (mirror
  `src/routes/messages/helpers.ts:157-169`).
- **Prompt injection:** a prompt section mirroring
  `src/chat/service/carriage.ts:90-148`, plus strip-before-wire mirroring
  `tool-execution.ts:239-243` so carriage labels never leak onto the
  participant wire.
- **Classification consumption:**
  `classify-intent.ts` (and split/transition) may consume carriage labels;
  raw-text English-assumed classification stays the fallback, never removed.

## Non-Goals

- **Full UI re-translation.** Reader/chat surface re-translation is owned by
  the publication-i18n tickets (`epic-publication-i18n.md`); this epic changes
  no participant-visible rendering.
- **Replacing `/translate` or auto-translate.** Both keep their current
  behavior; the translator role gains a carriage-writing side effect at most.
- **Touching `messages.metadata`.** It stays participant-visible plaintext;
  hidden carriage lives in the new table only.
- **No new intent taxonomy.** Triggering fill stays inside the existing
  write path and workflow runner; nothing is added to `AssistantIntent`.
- **Export.** Carriage rows are excluded from export (mirror the
  export-shared exclusion of `metadata`); no export format gains a locale
  section from this epic.

## Tasks

- [ ] `TASK-message-carriage-table-migration-admin-read.md` — table migration + admin-gated read path (028 pattern)
- [ ] `TASK-message-carriage-fill-path-detection.md` — detection + translator-role wiring at write time, original preserved
- [ ] `TASK-message-carriage-classification-integration.md` — classify-intent/split/transition consume carriage labels
- [ ] `TASK-message-carriage-prompt-injection-section.md` — prompt section mirroring carriage.ts + strip-before-wire
- [ ] `TASK-message-carriage-backfill-privacy.md` — plaintext-at-rest note, retention, export exclusion
- [ ] `TASK-message-carriage-translator-ticket-closeout.md` — verify the drifted translator-role ticket against code, propose status flip

## Acceptance Criteria

- [ ] Every new message records one carriage row (locale + labels) without rewriting the message body
- [ ] Classification can consume carriage labels; English-assumed raw-text path remains as fallback
- [ ] No participant-visible route, spread, or export exposes carriage rows (no `selectAll` leakage, no FTS pollution)
- [ ] Admin-gated read path works; key-scoped readers fail closed
- [ ] Prompt section injects carriage labels; strip-before-wire keeps them off the participant wire
- [ ] Gates green (`giwt plan validate`, check gate)

## Related

- `epic-hidden-carriage-context.md` — the `carriage_records` precedent this epic copies (table shape, admin gate, prompt section)
- `epic-publication-i18n.md` — owns full UI/publication re-translation; explicitly out of scope here
- `epic-i18n.md` — UI-string catalog; untouched
- `TASK-translator-model-role-with-general-model-fallback.md` — the translator-role ticket; close-out verification proposed in the close-out ticket below

- `FEAT-message-translations-chat-first.md` — chat-first message_translations consumer (open, re-filed here from output-control-transforms 2026-10-23; `epic-output-control-transforms.md` owns output transforms, not translation carriage)
- `TASK-translator-model-role-with-general-model-fallback.md` — translator model role (open, re-filed from aux-enrichment-pipeline 2026-10-23)
