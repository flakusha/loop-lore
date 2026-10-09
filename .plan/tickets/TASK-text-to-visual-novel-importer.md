<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Text to visual novel importer

**Summary:** Import a TXT/MD/PDF story into a playable VN — segment it into
scenes, extract characters, and scaffold dialogue beats and backgrounds
instead of a chat thread.
**Context:** Emergent-sweep candidate #36. Reuses the Depict compiler
(`TASK-depict-style-state-to-image-scene-compiler`) for style-consistent art;
export is owned by the story-bundle ticket. See `## Summary` and `## Acceptance`.
**Acceptance Criteria:** The boxes in `## Acceptance`.


**Status:** Not Started
**Priority:** medium
**Effort:** high
**Tags:** visual-novel, importer, text-to-vn, art, parser
**Epic:** epic-visual-novel-mode
**Git Issue:** 74b22f4

## Summary

Source: second emergent sweep, Story Studio AI text→illustrated VN importer (candidate #36).

Ingest plain text sources (TXT/MD/PDF), segment into scenes, extract characters, and scaffold a playable VN (dialogue beats, scene backgrounds, style-consistent illustrations) instead of a chat. Reuses Depict compiler (TASK-depict-style-state-to-image-scene-compiler) for art.

## Acceptance

- [ ] Parser for .txt/.md + PDF text extraction
- [ ] Scene segmentation + character extraction into VN scaffolding
- [ ] Art style lock option carried across generated scenes
- [ ] Output playable in VN mode; export via story bundle ticket
- [ ] Fixture tests for segmentation

## Delivery

- [ ] Implementation complete (all five boxes in `## Acceptance`)
- [ ] Tests passing
- [ ] Documentation updated
