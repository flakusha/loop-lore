# TASK: Depict-style state to image scene compiler

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** medium
**Epic:** epic-visual-novel-mode

## Summary

Source: second emergent sweep, DreamRunner.ai "Depict" (candidate #28, gap G44).

One-click "illustrate this scene": compile the current structured story state (characters present + appearance/outfits, location, POV, emotion) into a single image-generation request; attach the result to the scene as an asset. loop-lore's DB-persisted state makes the compiler cheaper here than for chat-window rivals.

## Acceptance

- [ ] State compiler assembles scene image prompt from character appearance/outfit + location + session/world state
- [ ] In-story trigger (VN mode + chat) attaches result via existing asset links
- [ ] Reuses emotion-avatar + provider image path; style consistency via existing consistency pipeline
- [ ] Tests: prompt-assembly golden test + attachment roundtrip

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
