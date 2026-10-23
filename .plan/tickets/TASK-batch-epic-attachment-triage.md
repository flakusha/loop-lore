<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: batch epic-attachment triage

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** (none — hygiene/self-contained)
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Follow-up batch: attach the backlog of open TASK/BUG tickets with no Epic field
and normalize non-canonical Epic-field spellings. Precedent: self-contained
cleanup tasks carry no epic (this ticket too).

**Context:**

Plan/epic audit 2026-10-23 (`.tmp/2026-10-23/plan-epic-audit.md` — scratchpad,
see it for method) found, recomputed at audit time:

- 580 open TASK/BUG tickets with no Epic field at all
- ~427 distinct Epic-field spellings (bare slugs, backticked paths, prose
  titles like "Epic 36 (Chat Lifecycle)", `:`, `(none)`) — many not resolving
  to any epic file
- index-side status drift (`open`, `draft`, `in_progress`, emoji variants) →
  `bun run plan:sync:fix` reconciles the alias-covered subset

**Approach**

- Scripted first pass: keyword-match unattached tickets against epic slugs
  (reuse the audit's map builder approach — `title + key` keywords → epic
  slug, exact Epic-field resolution preferred). Output a reviewable TSV.
- Per-area sweeps after: a human/agent pass per epic cluster confirms or
  corrects the mechanical match before `giwt ticket`/`plan validate --fix`
  applies it.
- Normalize every Epic field to the bare-slug convention.

**Acceptance Criteria:**

- [ ] Every open TASK/BUG ticket has an Epic field that resolves to an existing
      epic file, or an explicit "(none — hygiene/self-contained)" justification
- [ ] Epic fields use bare slugs only
- [ ] `bun run plan:validate` green on the linkage/status gates

**Resolved:** 2026-10-23 registry-driven close: git issue 57986c3 (registry tip: 0de0c2fd4 Konstantin Fedotov Auto-closed: appended .md marker marks TASK-BATCH-EPIC-ATTACHMENT-TRIAG)
