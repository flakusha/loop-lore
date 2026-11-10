# Stash evacuation — 2026-11-10

Source: dev-checkout stash list (9 entries, all still present — nothing popped, removed, or applied on the dev checkout).

Two stashes are PRESERVED AS APPLIED CODE in this worktree (patches already existed under .tmp/stash-evac/, apply check clean, different files, no overlap):

- src/routes/views/search.ts <- stash 4 (ec1a376da, scope 1 ticket): owner_id filter, non-admin users only see their own worlds
- src/routes/story-turns.ts <- stash 8 (d97478c33, post-merge reconciliation): error destructure in two story-turns handlers

The other 7 stashes are REFERENCE COPIES ONLY under evac/ — plain files and diffs that do not touch the build:

- stash 0 (257c15496, vectors regen) -> evac/stash-0-1-2-TASK-video-gen-route.md : drop-safe, 1-line Phase-A progress ticket note
- stash 1 (e214dcc8a, code-map refresh) -> same shared file : drop-safe, byte-identical blob d1d79bf0b in all of 0/1/2
- stash 2 (1d8d127ae, providerListNotice test init) -> same shared file : drop-safe, same 1-line note
- stash 3 (454933978, post-merge reconciliation) -> evac/stash-3-providerListNotice.diff : drop-safe, 1-line test-host init in general.test.ts
- stash 5 (killed-merge-untracked) -> evac/stash-5-untracked/ (22 files, untracked-only stash, third parent holds payload) : drop-safe, killed-merge payload superseded by stash 6 tracked copy
- stash 6 (dev-dirt-from-killed-merge) -> evac/stash-6-dev-dirt.diff (43 files, +975/-103) : drop-safe, killed-merge dirt as tracked copy
- stash 7 (worktree-finalize-dev-plan-artifacts) -> evac/stash-7-plan-artifacts.diff (5 generated .plan files, +2025/-67) : drop-safe, regenerated artifacts superseded by plan-artifacts run

Human action (on the dev checkout, NOT here): after review, clear each stash entry (highest index first), or keep any whose reference copy above turns out to still be needed.
