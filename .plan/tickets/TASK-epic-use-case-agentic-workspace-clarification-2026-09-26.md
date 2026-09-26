<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-epic-use-case-agentic-workspace-clarification-2026-09-26: clarify epic-use-case-agentic-workspace.md ownership

**Status:** open
**Priority:** medium
**Effort:** Small
**Type:** Task
**Summary:** `epic-use-case-agentic-workspace.md` (29 lines, 4 commits, last touch 2026-09-18) is a placeholder pointing at `docs/spec/use-case-agentic-workspace.md` (3.7 KB, substantive). The "agentic workspace" concept — an LLM-driven workspace with tool-calling + autonomous agent execution — overlaps significantly with `epic-assistant-gm-flows.md`, `epic-workflow-engine.md`, and matrix gap G42 (Tool-Calling / MCP).
**Context:** The 2026-09-19 audit flagged that "agentic" is overloaded across the codebase (agentic NPC, agentic workspace, agentic GM). Without clarifying ownership, tickets may land in the wrong epic and integration gaps will widen. Source row: 2026-09-26 epic audit; matrix reference: `matrix-cross-mechanics.md` G42.

**Decision required:** pick ONE of:

1. **Repurpose** — re-scope `epic-use-case-agentic-workspace.md` to the **user-facing agentic workspace surface** (the tools an end-user can compose: tool palette, agent run history, scheduling). Distinct from GM flows (which own in-character autonomous behavior) and the workflow engine (which owns internal Run sessions).
2. **Deprecate** — fold into `epic-assistant-gm-flows.md` + `epic-workflow-engine.md`. Delete this file.
3. **Split** — break into `epic-user-facing-agentic-tools.md` + `epic-agent-tool-registry.md` (matrix G42 ticket: tool-calling / MCP).

**Open questions:**
- Does "agentic workspace" mean a *user-as-operator* workspace (B2B-style) or a *character-as-agent* workspace (in-fiction autonomous NPC)?
- Does the 3.7 KB `docs/spec/use-case-agentic-workspace.md` already answer this, and we just haven't read it into the epic?
- Where does matrix G42 (Tool-Calling / MCP, "broadest integration gap") land if not here?

**Acceptance Criteria:**
- [ ] Disposition chosen; documented in surviving epic's `## Summary` with a clear answer to "agentic for whom"
- [ ] If repurpose: epic now has Tasks + Acceptance Criteria; cross-references to `epic-assistant-gm-flows.md` and `epic-workflow-engine.md` made explicit
- [ ] If deprecate: file deleted; cross-references updated; any in-flight tickets re-tagged
- [ ] If split: new files created; matrix G42 owned by one of them
- [ ] No `_TBD_` placeholders remain in surviving epic(s)

**Tags:** meta, epic-audit, agentic, clarification, tool-calling
**Related:** .plan/epics/epic-use-case-agentic-workspace.md, .plan/epics/epic-assistant-gm-flows.md, .plan/epics/epic-workflow-engine.md, .plan/matrix-cross-mechanics.md (G42), docs/spec/use-case-agentic-workspace.md


git issue: 5945a00
