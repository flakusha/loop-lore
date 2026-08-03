# TASK: Assistant: Command Execution & Intent Detection

**Status:** 🟡 Partial — slash command parser + AUX `classifyIntent` exist; no timeout/apiKey on AUX path, `detectIntent` dead (2026-08-01)
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
