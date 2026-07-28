# TASK: Repetition & Hallucination Guards

**Status:** ✅ Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-testing-benchmarking

## Summary

Flag n-gram loops and hallucinated entities in generation.

## Problem

LLMs can get stuck in repetition loops or hallucinate entities that don't exist in the world state.

## Scope

- Repetition detection: flag n-gram loops in generation
- Hallucination guard: validate referenced entities exist in world state
- Consistency check: compare new claims against established facts
- Integration with generation pipeline for real-time detection

## Acceptance Criteria

- [ ] Repetition detection flags n-gram loops
- [ ] Hallucination guard validates entity references
- [ ] Consistency check compares against established facts
- [ ] Tests: loops detected, hallucinations caught

## Files

- `src/generation/repetition.ts` (existing, extend)
- `src/chat/hallucination-guard.ts` (new)

## Related

- Epic 36 (Chat Lifecycle & Moderation)

## Completion Note

Created src/chat/hallucination-guard.ts — entity validation against world state
