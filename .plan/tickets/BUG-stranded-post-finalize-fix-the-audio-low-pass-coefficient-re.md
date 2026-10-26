<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Stranded post-finalize fix: the audio low-pass coefficient restore is still unmerged on fix-audio-lowpass-coefficient while dev ships the spectrum regression

**Status:** Done
**Priority:** critical
**Effort:** Medium
**Epic:** epic-tooling-improvement

**Summary:**

Status 2026-10-15 (re-verified this session): this is the remaining half of deep-landing F-4. The other stranded branch, fix-content-hash-cache (commits a62243f92 + 6ecd693ea: per-file replaced counter, shared HASHED_ASSET_PATTERN, recursive lookup), LANDED on dev - its finalize succeeded around 09:40 today after two failed attempts (giwt ledger gripes at 09:39:11 and 09:39:55: 'finalize fix-content-hash-cache failed (exit 1) - failed gates: dead - code (src files), plan - validate, weave - damage scan'; both commits are now reachable from dev HEAD).

Still stranded: commit 16b162180 'fix(generation): restore low-pass coefficient in audio provider' - git branch --contains 16b162180 shows only fix-audio-lowpass-coefficient (checked out in a worktree). The branch fix replaces the exp() one-pole with the original-texture coefficient, one divided by (2 times pi times fc over fs, plus 1); dev still runs alpha = 1 - Math.exp((-2 times Math.PI times cutoff) / sampleRate) at src/generation/audio/providers/local.ts:50, which the branch comment says changes every texture's spectrum.

Verification: REPRODUCED (git probes, read-only): git branch --contains 16b162180 -> only fix-audio-lowpass-coefficient; git branch --contains a62243f92 / 6ecd693ea -> dev (resolved half); dev-side local.ts:50 re-read this session and still carries the exp() coefficient.

Impact: dev ships an audio-spectrum regression the finalized branch was assumed to have fixed - a green finalize state masked the post-finalize commit.

Fix: rebase fix-audio-lowpass-coefficient onto current dev and re-finalize that worktree (giwt finalize); no source edit on dev itself. Pattern to avoid repeating: post-finalize commits on a finalized branch are silently stranded - re-run the branch-contains probe after late commits.

Source: .tmp/glm-review/deep-landing-1015.md F-4 (gitignored; recorded here verbatim; F-4's other half resolved as noted above).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue 12911db (registry tip: 9b5916506 Konstantin Fedotov Close issue)
