<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Asset Attribution Chain

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Summary:** Asset Attribution Chain
**Context:** Epic epic-assets-attribution; tags assets, attribution.
**Acceptance Criteria:** See ## Acceptance Criteria below.
**Epic:** epic-asset-platform-capabilities
**Tags:** assets, attribution

## Summary

Implement attribution chain persistence through transforms, attribution display in gallery/share, credits export format per docs/spec/assets-attribution.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Research addendum (2026-11-25)

- Attribution must travel with the transform chain: derived variants reference `source_asset_id`, and bundles carry `BundleManifestEntry.provenance` rather than scraping generated text.
- Gallery/share display consumes typed provenance fields from the shared view-model; keep the existing credits export contract unchanged.
- Evidence: `.tmp/research/dcc-libraries/README.md` promotion table.
