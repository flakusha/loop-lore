<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# Plan artifact spec

Single declarative source for `.plan/` record shapes and the generated
artifact set. Hand-maintained; `scripts/check-plan-artifacts.ts`
(`bun run plan:artifacts:check`) verifies the generated files below are
fresh, and `bun run plan:validate` enforces the record rules on content.

## Record types

### ticket (`.plan/tickets/*.md`)

Required `**Header:**` lines (colon inside or outside the bold, first match
in the header region wins; lines inside fenced code blocks never count):

- `**Status:**` — current state (any `Done` line wins per reconciler rule)
- `**Scope:**` — workstack the ticket belongs to
- `**Priority:**` — urgency
- `**Effort:**` — size estimate
- `**Epic:**` — owning epic (short name or `epic-*.md` file)
- `**Caveats:**` — standing risks / non-goals

Identity: filename slug ↔ H1 (minus the `TYPE:` prefix) ↔ index extid.
Folding is case/hyphen/space-insensitive, and a slug that is a prefix of
the H1 (filename truncation) still names the same ticket; the H1 and the
index title must agree at full length. `scripts/check-plan-linkage.ts`
(`bun run plan:linkage`) fails on genuine drift.

### epic (`.plan/epics/epic-*.md`)

Required lines:

- `**Status:**` — current state
- `**Priority:**` — urgency
- `**Overview:**` or a `## Overview` section — what the epic governs

## Generated artifacts

Rebuildable from the hand-written tree; never edit by hand. All are
gitignored (see `.gitignore`) and regenerated with `bun run plan:artifacts`.

| File | Regen command | Freshness gate |
| --- | --- | --- |
| `.plan/code-map.json` | `bun run plan:map` | `bun run plan:map:check` |
| `.plan/feature-matrix.md` | `bun run plan:matrix` | `bun run plan:matrix:check` |
| `.plan/priority-matrix.md` | `bun run plan:priority` | `bun run plan:priority:check` |
| `.plan/entry-map.md` | `bun run plan:entry-map` | `bun run plan:entry-map:check` |
| `.plan/interconnect.json` + `.plan/interconnect.md` | `bun run plan:links` | `bun run plan:links:check` |
| `.plan/epics-index.md` | `bun run plan:docs` (`giwt plan gen-docs`) | `bun run plan:docs:check` |

Adding a generated file means extending this table AND the `ARTIFACTS`
table in `scripts/check-plan-artifacts.ts` together.
