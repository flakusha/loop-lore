<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Single-assembly dedup across carriage, notes, quests, memory injection

**Effort:** Medium
**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Epic:** epic-hidden-carriage-context.md
**See also:** epic-context-injection-templates.md, epic-quests-encounters.md, epic-gm-shadow-notes.md
**Status:** Open
**Priority:** High

## Scope

- One injection assembler (alongside `src/memory/injection/` +
  `src/memory/provision.ts`): carriage, user notes, quest progress, and
  provisioned memory all submit entries with `{ source, id, hash }`;
  assembler dedups by content hash before prompt build — same fact from
  two systems injected once, attributed to first source.
- Budget accounting (`src/memory/budget.ts`) counts the deduped entry
  once; dropped duplicates logged with provenance for debug view.

## Acceptance

- Identical fact in a note and the carriage yields one prompt block.
- Budget usage reflects single inclusion; debug view lists the merge.
