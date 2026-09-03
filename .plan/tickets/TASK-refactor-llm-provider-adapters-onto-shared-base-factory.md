<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Refactor LLM provider adapters onto shared base factory

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

D2, decision 2026-09-03: refactor to base/factory IS PREFERRED. Cross-clones in generation/providers/{anthropic,ollama-native,openai-compatible}/{index,http}.ts (237t/69l, 216t/55l, 166t/23l; 9 files, ~6.3k tokens). Requirement: update docs/ and .plan/ whenever the change requirement (new provider shape) changes; coordinate base design with federation/swarm provider tickets so they land on the new shape, not the old copies.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
