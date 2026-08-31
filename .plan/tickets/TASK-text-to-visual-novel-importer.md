# TASK: Text to visual novel importer

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** high
**Epic:** epic-visual-novel-mode

## Summary

Source: second emergent sweep, Story Studio AI text→illustrated VN importer (candidate #36).

Ingest plain text sources (TXT/MD/PDF), segment into scenes, extract characters, and scaffold a playable VN (dialogue beats, scene backgrounds, style-consistent illustrations) instead of a chat. Reuses Depict compiler (TASK-depict-style-state-to-image-scene-compiler) for art.

## Acceptance

- [ ] Parser for .txt/.md + PDF text extraction
- [ ] Scene segmentation + character extraction into VN scaffolding
- [ ] Art style lock option carried across generated scenes
- [ ] Output playable in VN mode; export via story bundle ticket
- [ ] Fixture tests for segmentation

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
