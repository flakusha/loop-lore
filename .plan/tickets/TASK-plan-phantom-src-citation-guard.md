# TASK: Guard against plan prose citing nonexistent src/ paths

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Related:** TASK-plan-ticket-status-backfill.md

## Summary

Make it structurally impossible for plan prose to cite `src/` paths that do not exist, eliminating the code-map phantom class at the source.

## Context

`.plan/code-map.json` carries many keys pointing at nothing: whole phantom modules that were never built or were removed, plus path-shape drift inside live modules (file-vs-dir renames, deleted routes). `plan:map` faithfully indexes wishes, so regeneration cannot fix this — the prose must stop citing nonexistent paths (cite epics instead), and a check must enforce it. Candidate enforcement: extend `plan:map:check` or `md:links` to flag code-map keys missing on disk. Relevant tooling: `scripts/plan-code-map.ts`, `scripts/check-md-links.ts`.

## Acceptance Criteria

- [ ] No-cite-nonexistent-paths rule recorded
- [ ] Guard gate exists and is green (phantom keys flagged, not silently indexed)
- [ ] Existing phantom citations removed or re-pointed at epics
- [ ] `bun run plan:map:check` green
