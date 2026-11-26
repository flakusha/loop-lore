<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: release-cut-changelog-1-0-0-section-and-sync-workspace-version

**Status:** Done
**Status Note (2026-11-18):** Shipped on dev. CHANGELOG.md carries the `## [1.0.0] - 2026-11-18` section (line 10), so the tag-triggered notes step in .github/workflows/release.yml:210-227 now finds `## [$TAG]` for tag `1.0.0` and no longer errors with "no section ## [$TAG]". The workspace version is synced to the released version: package.json `1.0.0` (bumped from `0.1.0` in dev commit 96194f4a5) and packages/core/package.json `1.0.0` (bumped in dev commit 460d849f5) — verified on dev @ 0f6c1e06c. The release workflow's notes step is backed by the `bun run test:unit` gate added in the release job (.github/workflows/release.yml:146-147, commit 76e73e369 "chore(release): run unit tests before publishing a tag"), so a tag pushed at a red commit fails before artifact generation. The 1.0.0 cut itself is landed as dev commit 460d849f5 "docs(release): cut 1.0.0 changelog and reconcile plan" (CHANGELOG.md +20, packages/core/package.json version sync, docs/guide/state-and-instances.md). Verified 2026-11-18: replaying the release.yml notes-step awk against CHANGELOG.md with TAG=1.0.0 extracts a non-empty 27330-char section (the step would otherwise abort with "no section ## [$TAG]"), and `bun run scripts/check-changelog.ts` reports "changelog - gate: OK - [Unreleased] present, 2 version section(s)". The 1.0.0 tag and the release push remain the operator's call (not in this ticket's scope).
**Priority:** high
**Effort:** Small
**Tags:** release, changelog, version, release-yml

**Summary:**

Cut the 1.0.0 CHANGELOG section and sync the workspace version so the tag-triggered release.yml notes step can produce notes.

Closes finding R9 (report 05 §(d): the release notes step errors with "no section ## [$TAG]").

Release tracker: TASK-epic-release-1-0-0.md.

**Depends on:** the wave-1 landing's changelog entry shape (the landed-tree entry naming the old and new upload/TLS/DB locations) — cut the 1.0.0 section on top of it. The 1.0.0 tag itself is the operator's call.

Explicitly NOT building:

- The 1.0.0 tag itself or the release push (operator decision).
- A changelog rewrite beyond the 1.0.0 section.
- Changes to the release workflow beyond what the notes step needs.

**Caveats:** tag-gated workflow step, single-source version, changelog conflicts with in-flight entries

**Context:**

(Original finding, as filed 2026-11-11 — the state below is the PRE-cut state; see the Status Note for the shipped result.)

- .github/workflows/release.yml:210-227 — the notes step errors with "no section ## [$TAG]" when the tag has no matching CHANGELOG section. (The step still aborts on a missing section; that guard is unchanged.)
- CHANGELOG.md pre-cut: :8 was ## [Unreleased], :43 was ## [0.1.0] — there was no ## [1.0.0] section. (Post-cut: :8 ## [Unreleased], :10 ## [1.0.0] - 2026-11-18, :69 ## [0.1.0] - 2026-11-09.)
- The workspace version must match the released version so the tagged build and the generated notes agree on the version being released.

Minimal fix (shipped): add a ## [1.0.0] CHANGELOG section collecting the release scope, and sync the workspace version to the released version so the release.yml notes step passes.

Residual (operator's call, outside this ticket): the `1.0.0` git tag and the release push.

Recurrence risk (not fixed by this ticket, no gate covers it today): `scripts/check-changelog.ts` compares CHANGELOG sections against the latest numeric **git tag** (`latestGitTag()`), and it compares package.json against that same tag (`scripts/check/parallel/nonblocking.mjs` version-drift check). It never compares the package.json version against the CHANGELOG sections. With no numeric tag in the repo yet, both checks are inert — the changelog gate reports OK on structure alone. So the original failure mode (bump the version, forget the section) is currently silent until someone pushes a tag; the guard only exists as the release workflow's own notes step, which fails after the tag is already pushed. A future gate that asserts "the package.json version has a matching CHANGELOG section" would close it.

**Acceptance Criteria:**

- [x] CHANGELOG.md has a ## [1.0.0] section.
- [x] The workspace version matches the released version.
- [x] The tag-triggered workflow passes the notes step (.github/workflows/release.yml:220).
- [x] Tests passing, documentation updated.
