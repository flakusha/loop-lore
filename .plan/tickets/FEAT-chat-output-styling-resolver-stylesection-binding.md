# FEAT: Chat output styling: resolver + styleSection binding

**Status:** ✅ Done
**Priority:** medium
**Effort:** Medium

## Summary

Add outputStyle chat setting (preset + customInstruction + intensity) with chat->user->server fallback mirroring src/chat/response-length.ts. New styleSection in PROMPT_SECTIONS (src/assistant/prompt/registry.ts) emitting an XML-wrapped directive after systemSection; wire resolveOutputStyle into PromptAssembler.assemble() and extend the chats select (prompt-assembler.ts:56) to include output_style_preset + gm_config. Also wire the currently-unwired resolveResponseLength. Disabled-by-default guard keeps assembly tests/prompt hashes stable. Part of epic-chat-context-optimization.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

Verified against src/ in ticket-closeout-audit: output-style.ts resolveOutputStyle wired into prompt-assembler; styleSection registered.
