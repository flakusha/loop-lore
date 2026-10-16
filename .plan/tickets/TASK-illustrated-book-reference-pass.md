<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Illustrated-Book Pass with Reference Conditioning

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-narrative-publishing-workflows
**Related:** `TASK-book-outline-generation-workflow.md`, `TASK-publication-art-quality-gates.md`, `TASK-comic-storyboard-panel-generation-workflow.md`, `TASK-publication-viewer-read-mode.md`, `epic-comfyui-plugin.md`, `epic-assistant-creative-studio-workflows.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

The illustrated tier for books: a second pass over an already-persisted
text-only book that produces an illustration set per chapter and, for comics, a
reference set derived from accepted prior art. The point of the pass is
character consistency — the same character must look like the same character
across forty chapters.

## Context

**Illustration is an optional pass over existing text, never a second
pipeline.** The book units already exist and are already accepted; this pass
reads them and writes `assets` rows plus links. It must not regenerate prose and
it must not fork the artifact.

The pass is a workflow template (`configs/templates/workflows/book-illustrate.yaml`)
because that is how this repo expresses a multi-step, confirmed,
quality-gated generation scenario. The LLM step produces, per chapter, a set of
illustration specs (prompt, subject, mood, aspect); the art step dispatches them.
The prose → spec step is text and runs through `src/assistant/workflow-runner.ts`
unchanged. The art step, like the comic one, dispatches N jobs and writes each
result as it lands, using `createAsset` / `linkAsset` and the existing
`POST /api/v1/generation/image` (`src/generation/controller.ts:123`) and
`POST /api/v1/image-edit/run` (`src/image-edit/routes.ts:247`) endpoints.

**Reference conditioning is the dependency, and it is not ours.** Character
consistency across a long book needs reference-conditioned editing — feeding a
prior accepted image into the next generation so the model keeps the face,
hair, and silhouette. The templates for that (FLUX.1 Kontext, Qwen Image Edit,
Krea 2) live under `epic-comfyui-plugin.md` and are still open there. This ticket
depends on them and does not own them. Design the reference-set builder so it
works with an empty reference set (first illustration has no prior art) and so
swapping in the reference template later is a config change, not a rewrite.

A chapter may need zero, one, or several illustrations. "Zero" is a normal
outcome — a transition chapter with no visual beat must not be forced to produce
art, and forcing it is how a book ends up with a repeated stock illustration.

Reference selection rule: draw from **accepted** illustrations earlier in the
same publication, nearest-first, bounded by a configurable count. Pinned
illustrations are always included. Rejected illustrations never enter a reference
set — a rejected image must not become the face of the character.

## Acceptance Criteria

- [ ] `configs/templates/workflows/book-illustrate.yaml` exists with
      `merge: extend`, an `illustrate-book` workflow, `intent`
      (`type: generate`), and steps for per-chapter illustration spec generation;
      the loader accepts it with no validation error
- [ ] The template targets an already-persisted publication id — the run reads
      existing `publication_units` and never writes prose
- [ ] `src/publications/illustrate/` builds a reference set per publication from
      earlier **accepted** illustrations, nearest-first and count-bounded, with
      pinned illustrations always included and rejected ones excluded (unit tests)
- [ ] The reference-set builder returns an empty set for the first illustration
      rather than failing, so the pass works before any art exists
- [ ] Per-chapter illustration specs (prompt, subject, mood, aspect) are generated
      as a workflow step and are editable before dispatch; a chapter the user
      marks "no illustration" is skipped and persists no asset
- [ ] Dispatch issues one `POST /api/v1/generation/image` (or
      `POST /api/v1/image-edit/run` when a reference set is present) per spec and
      writes each result via `createAsset` + `linkAsset`
- [ ] A failed illustration leaves the chapter without art and records the error;
      re-running fills only the gaps
- [ ] If the reference-conditioned edit templates have landed under
      `epic-comfyui-plugin.md`, the reference set is forwarded to the edit endpoint;
      if not, the pass runs unconditioned and the gap is recorded rather than
      blocking the tier
- [ ] No new generation route is added; the existing v1 generation/edit endpoints
      are the only dispatch targets
- [ ] Re-running the pass never deletes an accepted illustration the user did not
      ask to replace