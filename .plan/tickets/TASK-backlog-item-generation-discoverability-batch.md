<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: backlog — schedule Item-Generation Discoverability batch (P2-C assistant tooling)

**Status:** open
**Priority:** medium
**Effort:** Medium
**Type:** Task
**Summary:** The 4-issue Item-generation discoverability cluster (open-untriaged.md § New clusters) covers subcommand docs, describe-preview-confirm UI, review parity, and shared draft store. Each has an existing ticket pointer under epic-entity-generation-workflows. This ticket captures the batch into one tracking ticket so P2-C assistant tooling work ships as a coordinated unit.
**Context:** Per open-untriaged.md § Suggested home, suggested home is P2-C assistant tooling. The 3 of 4 source files already carry the correct Epic: field (per open-untriaged.md § 2026-09-25); index-regeneration is the only remaining bookkeeping step.

## Issues in scope

| Git issue | Topic | Existing ticket / epic |
| --- | --- | --- |
| 0d771c9 | subcommand docs | epic-entity-generation-workflows (existing) |
| 0f840fd | describe-preview-confirm UI | epic-entity-generation-workflows (existing) |
| b95bbff | review parity | epic-entity-generation-workflows (existing) |
| 219124a | shared draft store | epic-conversation-branching (existing) |

**Acceptance Criteria:**

- [ ] Each of the 4 git issues linked to its existing ticket file.
- [ ] Subcommand docs reference 100% of /create subcommands; describe-preview-confirm flow mirrors assistant creation wizards (already shipped via C3).
- [ ] Review parity confirmed against gallery upload dropzone precedent.
- [ ] Shared draft store schema documented (column + lifecycle).
- [ ] index.json updated via plan:sync:fix.

**Tags:** item-generation, assistant, subcommands, draft-store, p2-c
**Related:** .plan/backlog/open-untriaged.md § New clusters, .plan/epics/epic-entity-generation-workflows.md, .plan/epics/epic-conversation-branching.md


git issue: 9f9e158
