<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-epic-transport-layer-expansion-clarification-2026-09-26: clarify epic-transport-layer-expansion.md vs epic-transport-expansion.md / epic-realtime-transports.md

**Status:** open
**Priority:** medium
**Effort:** Small
**Type:** Task
**Summary:** `epic-transport-layer-expansion.md` (30 lines, 3 commits, last touch 2026-09-18, ID `EPIC-2026-35`) is a placeholder referencing `future-features-plan.md`. Three siblings cover related territory: `epic-transport-expansion.md` (88 lines, transport-layer architecture), `epic-realtime-transports.md` (now 98 lines after this audit's IP addition — WebSocket / WebTransport), and `docs/spec/transport-unified.md`.
**Context:** The 2026-09-25 docs-vs-plan audit flagged redundant transport-layer epics. The `epic-realtime-transports.md` parent (`epic-headless-alternative-frontends.md`) is the natural umbrella for WS / WebTransport; `epic-transport-layer-expansion.md` and `epic-transport-expansion.md` describe architecture without owning concrete tickets. Source row: 2026-09-26 epic audit.

**Decision required:** pick ONE of:

1. **Deprecate** — both `epic-transport-layer-expansion.md` and `epic-transport-expansion.md` are redundant with `epic-realtime-transports.md` + `epic-headless-alternative-frontends.md`. Delete the older two; re-route any tickets to the umbrella.
2. **Repurpose `epic-transport-layer-expansion.md`** — re-scope to the architectural narrative (why transport unification matters, dependency order, non-realtime considerations like HTTP/3, multipart upload). Keep as the umbrella; have `epic-realtime-transports.md` and `epic-transport-expansion.md` reference it.
3. **Split** — break into `epic-transport-http-3.md` + `epic-transport-streaming.md` with concrete ticket references each.

**Open questions:**
- Is HTTP/3 in scope? If yes, that's a real gap; if no, the epic is pure placeholder.
- Does `docs/spec/transport-unified.md` already cover the architectural narrative, making both transport epics pure forward planning?
- Any in-flight tickets reference `epic-transport-layer-expansion.md`?

**Acceptance Criteria:**
- [ ] Disposition chosen; documented in surviving epic's `## Summary`
- [ ] If deprecate: redundant files deleted; cross-references updated; `EPIC-2026-35` ID retired
- [ ] If repurpose: epic now has Tasks + Acceptance Criteria + cross-refs to `epic-realtime-transports.md` + `epic-headless-alternative-frontends.md`
- [ ] If split: new files created with full scope; old file deleted
- [ ] No `_TBD_` placeholders remain in the surviving epic(s)

**Tags:** meta, epic-audit, transport, clarification
**Related:** .plan/epics/epic-transport-layer-expansion.md, .plan/epics/epic-transport-expansion.md, .plan/epics/epic-realtime-transports.md, .plan/epics/epic-headless-alternative-frontends.md, docs/spec/transport-unified.md


git issue: bf2de0c
