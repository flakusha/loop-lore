<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Assistant: Command Execution & Intent Detection

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** In Progress
**Status Note:** slash command parser + AUX `classifyIntent` exist; no timeout/apiKey on AUX path, `detectIntent` dead (2026-08-01)
**Priority:** high
**Effort:** Medium
**Epic:** epic-assistant-gm-flows

## Summary

Assistant command parsing: /improve, /dice, /stats, /attack, /image with intent detection from natural language. Tiered access (all/member/GM). Wire to future RPG dice/stats. High impact UX.

## Current State (2026-08-01 review)

| Component                                                   | Status                                                                                                                       | Location                                                              |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Slash command parsing + execution                           | ✅ implemented (create/help/etc.)                                                                                            | `src/assistant/command-parser.ts`, `src/assistant/commands/create.ts` |
| AUX intent classification                                   | ⚠️ exists but **no timeout** (awaited pre-generation), **no apiKey**, temp 0.1                                                | `src/generation/auto-gen.ts:74` `classifyIntent`                      |
| Intent vocabulary                                           | ⚠️ disjoint from assistant: `greeting/question/command/roleplay/narrative` vs `assistant/intent.ts` `generate/tool_exec/chat` | —                                                                     |
| `detectIntent()` + `APPROVED_TOOLS`                         | ❌ **dead code** — zero consumers                                                                                            | `src/assistant/intent.ts:53`                                          |
| `detectAvatarChangeIntent()`                                | ❌ **dead code** — zero consumers                                                                                            | `src/assistant/intent.ts:139`                                         |
| Tiered access (all/member/GM)                               | ❌ not implemented                                                                                                           | —                                                                     |
| `/improve`, `/dice`, `/stats`, `/attack`, `/image` commands | ⚠️ `dice`/`improve`/`impersonate`/`narrate`/`help` in `APPROVED_TOOLS` (unused); `/image` not wired                           | `src/assistant/intent.ts:25`                                          |

## Next Actionable Items

1. **Migrate `classifyIntent` to shared AUX runner** (epic M1): add the
   missing 2s timeout (currently blocks every message), resolve apiKey via
   `resolveProvider` for BYO parity, align temperature with the 0.0
   classification discipline.
2. **Single intent vocabulary**: one shared `AssistantIntent` taxonomy across
   `assistant/intent.ts` and `auto-gen.classifyIntent` — either assistant
   regex extends LLM outputs or the LLM prompt uses the regex taxonomy.
3. **Wire `detectIntent` or delete it**: the intended flow (approve → tool
   exec) has no consumer; decide whether the AUX classification should route
   into `executeToolCalls`/plugin registry, then remove dead exports.
4. **Command scope**: `/improve`, `/dice`, `/stats`, `/attack`, `/image` +
   tiered access (all/member/GM) per original scope; `/image` should call
   the image-edit pipeline.
5. **Tests**: command parser tests exist (`command-parser.test.ts`); add
   AUX-intent → tool-dispatch integration test.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated


## Verification 2026-09-26

Verdict: **still-open-expanded** — two of four "Next Actionable Items" are done; vocabulary + command-scope items remain.

Src checked:
- `src/generation/auto-gen/classify-intent.ts:43-47` — `classifyIntent` now runs on the shared `callAux("intent", …, { temperature: 0, maxTokens: 100 })` runner (2s timeout + BYO-key handled centrally in `src/aux-pipeline/runner.ts`), called pre-generation from `call-llm.ts:108` with the `shortReply && confidence > 0.7` fast path. The "no timeout/apiKey" claim is STALE.
- `src/assistant/command-parser.ts` + `src/assistant/commands/` — slash parsing/execution live (incl. `/image` usage-hint path in `simple-commands.test.ts:137`); `src/assistant/commands/registry.test.ts` covers tiered `requiredRole` metadata (`getCommandRequirement`).
- `src/assistant/intent.ts` — `detectIntent`/`APPROVED_TOOLS` are GONE (only `detectAvatarChangeIntent` + `AssistantIntent` re-export from `src/regex/intent` remain); the "dead code" claim is half-stale — the dead classifier was deleted, the avatar helper is retained-but-unused (zero production consumers).
- `src/generation/image-edit-service/` + `src/image-edit/routes.ts` — image-edit pipeline mounted (`POST /api/v1/image-edit/run`); assistant `/image` → pipeline wiring still unverified.

Refreshed deltas:
- Done: M1 runner migration (timeout/BYO/temp), dead-`detectIntent` removal.
- Still open: (1) single intent vocabulary across `src/regex/intent.ts` `AssistantIntent` and the LLM `intent` prompt; (2) route AUX intent → `executeToolCalls`/plugin registry (or confirm `classifyIntent` shortReply-only scope and close); (3) `/improve /dice /stats /attack /image` + tiered access end-to-end (registry metadata exists, per-command enforcement + `/image`→pipeline call unverified).
