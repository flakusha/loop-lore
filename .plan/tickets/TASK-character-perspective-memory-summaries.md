# TASK: Character perspective memory summaries

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** medium
**Epic:** epic-character-core-system

## Summary

Source: second emergent sweep, DreamRunner.ai character-perspective memories (candidate #27, gap G43). Builds on TASK-char-memory-* family + FEAT-memory-systems-three-tier.

Story summaries kept per character as bullet lists written from that character's own point of view; each character's description/personality/existing memories feed back into the summarizer so new memories stay in-character; retrieval injects the speaking character's memories into generation (the grumpy mentor and the apprentice remember the same scene differently).

## Acceptance

- [ ] Per-POV bullet memory store keyed by character per summary window
- [ ] Summarizer prompt fed with existing description + prior memories
- [ ] Generation-time injection biased to the active character's POV
- [ ] Regenerate-latest-summary affordance
- [ ] Tests: POV divergence golden test + regeneration idempotence

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
