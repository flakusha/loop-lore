<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Comic Captions and Speech-Bubble Layout + Rendering

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-narrative-publishing-workflows
**Related:** `TASK-comic-page-panel-layout-model.md`, `TASK-comic-storyboard-panel-generation-workflow.md`, `TASK-publication-viewer-read-mode.md`, `TASK-publication-export-formats.md`, `epic-visual-novel-mode.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

Caption boxes and speech bubbles on generated comic panels: automatic placement
from the storyboard's speaker data, manual override, and rendering that keeps
text inside the panel at every size. Text over art is where a generated comic
usually falls apart, so this is a quality ticket, not a decoration.

## Context

The storyboard pass already produces, per panel, a caption and a bubble text
(`TASK-comic-storyboard-panel-generation-workflow.md`), and the schema ticket
stores `caption` and `bubble_text` on `publication_panels`. What is missing is
turning those strings into a placed, styled, readable box — and doing it the
same way in the editor, the viewer, and the export path.

Reuse, not reinvention:

- Bubble tails/anchors are anchored overlays — the anchor primitives already
  exist in `src/frontend/vn/sprite-stage.ts` (same reuse as the panel layout).
- Text reveal/pacing reuse `typewriter.ts` from `src/frontend/vn/` where the
  reader wants it; the export path does not animate at all.
- Placement is stored, not computed at render time, for the same reason panel
  geometry is (`TASK-comic-page-panel-layout-model.md`): three renderers that
  each recompute placement will drift.

Placement algorithm — keep it simple and deterministic. Candidate positions
(top-left, top-right, bottom-left, bottom-right, and a bottom-caption band) are
scored against the panel rectangle; the first that fits without overlapping the
**subject region** wins. The subject region is what the storyboard supplies (a
focus box per panel); without one, fall back to bottom-caption-band only. A
detector-based "find the empty part of the image" pass is explicitly out of
scope — it is a research project, and a wrong-but-predictable box beats an
unreliable smart one.

Speaker attribution is the storyboard's job (it knows who is talking); this
ticket consumes `bubble_text` plus speaker id. A bubble with no speaker renders
as a caption box instead of a balloon.

Rendering must be resolution-independent: the same stored placement renders at
panel width 400 and 2000. That means font size and padding scale with panel
width, and long text shrinks or wraps rather than overflowing. Text overflowing
its balloon is the single most common failure mode here.

## Acceptance Criteria

- [ ] `bubble_text` and `caption` render as a balloon (with speaker tail) or a
      caption box, chosen by whether a speaker is attached
- [ ] Automatic placement scores the candidate positions against the panel
      rectangle and the panel's focus/subject box, deterministically, with unit
      tests over a set of panel rectangles
- [ ] When no subject box is supplied, placement falls back to the bottom caption
      band — never to a guessed free region of the image
- [ ] Placement is stored on the panel row (in `layout_json`) and read by every
      renderer; no renderer recomputes it
- [ ] A manual placement override from the authoring surface wins over the
      automatic score and survives a re-render
- [ ] Type scales with panel width: at 400px and at 2000px panel width the text
      stays inside the balloon bounds with no overflow, covered by a test at both
      widths
- [ ] Long text wraps and shrinks to a floor size; past the floor it truncates
      with an indicator rather than overflowing
- [ ] Rendering is escape-safe — user/LLM-authored bubble text is HTML-escaped
      before rendering (reuse `src/routes/views/escape-html.ts`)
- [ ] Editor, viewer, and image-sequence export share one placement+bubble
      renderer; a test asserts all three produce the same geometry for the same
      panel
- [ ] Anchor primitives come from `src/frontend/vn/sprite-stage.ts` — no second
      anchor implementation under the publication tree