<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Chat format wrapper corrupts content via String.replace replacement patterns

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:** chat format wrapper corrupts content via string replace repl
**Context:** Context: 2a0d9f9c6 (09-25) introduced applyChatFormat.
**Acceptance Criteria:** use a replacer function — wrapper.replace("${content}", () => msg.content).

## Summary

Context: 2a0d9f9c6 (09-25) introduced applyChatFormat. Severity: blocking. Evidence: src/generation/generate-format.ts:40 calls wrapper.replace("${content}", msg.content) — msg.content is a REPLACEMENT string, so $&, $`, $', $$ sequences in user/assistant content are pattern-substituted into the LLM payload (e.g. 'echo $$' → 'echo $'), silently corrupting prompts. generate-format.test.ts pins only $-free content so the suite passes. Repro: format a message containing '$&' through any chatFormat template. Fix: use a replacer function — wrapper.replace("${content}", () => msg.content).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
