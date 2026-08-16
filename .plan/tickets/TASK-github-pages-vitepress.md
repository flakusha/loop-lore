<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: GitHub Pages — VitePress Static Site Hosting

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** Low–Med
**Epic:** epic-tooling-improvement

## Summary

Host project documentation on GitHub Pages using VitePress. Open-source project — no feature hosting, only informational site (docs, API reference, getting-started guides).

## Rationale

- Open-source project benefits from public-facing documentation site
- VitePress already used for `docs/` markdown rendering
- Zero hosting cost on GitHub Pages
- SEO-friendly for discoverability

## Scope

- **In scope:** VitePress static site from `docs/` subset
- **Out of scope:** Feature hosting, app deployment, dynamic content

## Tasks

### Phase 1: Setup

- [ ] Create `.github/workflows/deploy-docs.yml` — VitePress build + deploy to `gh-pages` branch
- [ ] Configure VitePress in `docs/.vitepress/config.ts` — site metadata, nav, sidebar
- [ ] Select docs subset for public hosting:
  - `docs/guide/` — getting started, setup
  - `docs/spec/` — architecture, schema, API routes (public parts only)
  - `docs/frontend/` — UX spec (non-sensitive)
  - `docs/meta/` — roadmap, contributing (exclude internal tickets)
- [ ] Add `.vitepress/ignore` or exclude patterns for sensitive/internal docs
- [ ] Configure base URL for GitHub Pages (`/loop-lore/`)

### Phase 2: Content Curation

- [ ] Review all docs for public-appropriate content
- [ ] Exclude: `.plan/`, internal specs, credentials, private architecture details
- [ ] Add redirects for old URLs if any
- [ ] Verify all internal links resolve

### Phase 3: Deploy & Verify

- [ ] Push to `master` → triggers GitHub Actions deploy
- [ ] Verify site loads at `https://<user>.github.io/loop-lore/`
- [ ] Check all pages render correctly
- [ ] Verify search functionality works
- [ ] Add deploy status badge to root README

## Files to Create

- `.github/workflows/deploy-docs.yml` — CI/CD for docs deployment
- `docs/.vitepress/config.ts` — VitePress configuration (if not exists)

## Files to Modify

- `docs/` — potential content curation/exclusions
- Root `README.md` — add docs site badge

## Considerations

- **Sensitive content audit:** Ensure no credentials, internal plans, or private architecture details leak to public site
- **Selective hosting:** Only `docs/` subset — not full repo
- **Open-source compliance:** Verify no license issues with public docs hosting

## Risk

Low — static site hosting, no runtime impact, open-source safe.

## Linked Epics

- `epic-tooling-improvement.md`
