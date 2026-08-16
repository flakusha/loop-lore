<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Inner Monologue / Silent Thinking

**Status:** Not Started
**Priority:** P6+ (Deferred)
**Effort:** High
**Created:** 2026-08-14
**Source:** Platform research deep-dive (Convai)

## Description

Implement inner monologue system where the assistant generates internal observations and thoughts even when not actively responding to the user. Inspired by Convai's "reasoning mind" architecture where agents "think" even when silent.

## Requirements

1. **Background Thinking**: assistant generates observations about conversation context between user messages
2. **Observation Types**: environmental observations, emotional state changes, goal progress, relationship updates
3. **Memory Integration**: inner monologue observations stored in memory stream with importance scores
4. **Selective Disclosure**: user can optionally view assistant's inner monologue
5. **Resource Efficiency**: background thinking should be lightweight, not consume excessive tokens
6. **Trigger Conditions**: inner monologue fires on significant events (mood change, new memory, time passage)

## Mapping

- **Platform Candidate**: Convai reasoning mind
- **Epic**: Platform Research (#23)
- **Integration**: memory system (reflection), character-core-system (mood), turn orchestration

## Acceptance Criteria

- [ ] Assistant generates observations between user messages
- [ ] Observations stored in memory with importance scores
- [ ] User can optionally view inner monologue
- [ ] Resource-efficient (lightweight LLM calls)

## References

- Convai agentic architecture: https://convai.com/blog/agentic-platform-virtual-worlds-convai
