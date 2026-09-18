<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Prompt & Output Control

**Effort:** Medium
**Type:** epic
**Tags:** (none)
**Overview:** (see sections below)


**Status:** ⬜ Not Started
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
| Auto-translation layer                   | `src/generation/translate.ts` (new)   | Med    | ideas #7    |
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
