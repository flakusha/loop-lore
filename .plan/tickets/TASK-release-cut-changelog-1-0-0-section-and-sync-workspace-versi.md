<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: release-cut-changelog-1-0-0-section-and-sync-workspace-version

**Status:** Not Started
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

- .github/workflows/release.yml:205,220 — the notes step errors with "no section ## [$TAG]" when the tag has no matching CHANGELOG section.
- CHANGELOG.md:8 is ## [Unreleased], :43 is ## [0.1.0] — there is no ## [1.0.0] section yet.
- The workspace version must match the released version so the tagged build and the generated notes agree on the version being released.

Minimal fix: add a ## [1.0.0] CHANGELOG section collecting the release scope, and sync the workspace version to the released version so the release.yml:220 notes step passes.

**Acceptance Criteria:**

- [ ] CHANGELOG.md has a ## [1.0.0] section.
- [ ] The workspace version matches the released version.
- [ ] The tag-triggered workflow passes the notes step (.github/workflows/release.yml:220).
- [ ] Tests passing, documentation updated.
