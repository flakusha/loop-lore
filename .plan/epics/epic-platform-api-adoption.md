<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Platform API Adoption

**Overview:** (see sections below)

**Status:** Not Started
**Priority:** P2
**Effort:** Large
**Type:** Feature Epic / Platform Modernization
**Tags:** bun, web-platform, apis, modernization
**Issue:** (none)

## Summary

Hand-rolled shims across `src/` re-implement what Bun.* and standard web
platform APIs now provide: buffer building, cookies, deep equality, DNS, HTML
escaping, file I/O, glob, gzip, image processing, inspect formatting, markdown,
password hashing, semver, shell, sleeps, child processes, TS transpilation,
binary discovery — plus browser-side platform APIs (dialog, IntersectionObserver,
Notification, Page Visibility/Service Worker, Popover, View Transitions, Web
Animations, Web Share/Clipboard). This epic replaces each shim with the platform
call and deletes the hand-rolled code.

## Scope

1. **Bun runtime APIs**: adopt `Bun.*` where it replaces hand-rolled or
   dependency code; each adoption deletes the shim it replaces.
2. **Web platform APIs**: adopt standard browser APIs for modals, lazy loading,
   notifications, visibility, popovers, view transitions, animations, and
   sharing/clipboard.
3. **One adoption per ticket**: each member ticket owns a single API swap with
   a regression test and a dependency/shim deletion.

## Tasks

- [ ] `TASK-adopt-bun-arraybuffersink-for-buffer-building`
- [ ] `TASK-adopt-bun-cookie-for-cookie-handling`
- [ ] `TASK-adopt-bun-deepequals-for-test-assertions`
- [ ] `TASK-adopt-bun-dns-for-dns-resolution`
- [ ] `TASK-adopt-bun-escapehtml-for-xss-prevention`
- [ ] `TASK-adopt-bun-file-bun-write-for-file-i-o`
- [ ] `TASK-adopt-bun-glob-for-file-matching`
- [ ] `TASK-adopt-bun-gzipsync-for-compression-standardization`
- [ ] `TASK-adopt-bun-image-for-image-processing`
- [ ] `TASK-adopt-bun-inspect-for-custom-formatting`
- [ ] `TASK-adopt-bun-markdown-to-replace-marked`
- [ ] `TASK-adopt-bun-password-for-password-hashing`
- [ ] `TASK-adopt-bun-peek-for-non-blocking-inspection`
- [ ] `TASK-adopt-bun-semver-for-version-comparison`
- [ ] `TASK-adopt-bun-shell-for-shell-commands`
- [ ] `TASK-adopt-bun-sleep-for-async-delays`
- [ ] `TASK-adopt-bun-spawn-for-child-processes`
- [ ] `TASK-adopt-bun-transpiler-for-plugin-typescript`
- [ ] `TASK-adopt-bun-which-for-binary-discovery`
- [ ] `TASK-adopt-dialog-api-for-native-modals`
- [ ] `TASK-adopt-intersection-observer-for-lazy-loading`
- [ ] `TASK-adopt-notification-api-for-desktop-notifications`
- [ ] `TASK-adopt-page-visibility-api-and-service-worker`
- [ ] `TASK-adopt-popover-api-for-tooltips-dropdowns-context-menus`
- [ ] `TASK-adopt-view-transitions-api-for-page-navigation`
- [ ] `TASK-adopt-web-animations-api-for-vn-scenes`
- [ ] `TASK-adopt-web-share-api-and-clipboard-api`

## Acceptance Criteria

- [ ] Every member swap lands with a regression test covering the replaced behavior
- [ ] The shim/dependency each adoption targets is deleted in the same change
- [ ] `bun run check` stays green across the series; no new runtime dependencies added where a Bun/web API suffices

## Related Epics

- `epic-frontend-overview.md` — previously hosted the view-transitions adopt ticket (moved here per final triage verdict)
- `epic-code-quality.md` — sibling modernization/cleanup work

## Bind Tickets

- 27 member tickets listed under ## Tasks (all open)
