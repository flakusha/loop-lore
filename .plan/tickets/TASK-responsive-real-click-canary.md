<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Add one real-click responsive canary at desktop + mobile widths

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Not Started
**Priority:** medium
**Effort:** Small

## Summary

Browser tests run at a fixed 1440×900 viewport (`tests/e2e/helpers/browser-server.ts:189-191`). `navigateViaHtmx()` calls `element.click()` inside `page.evaluate()` to bypass pointer reachability (`tests/e2e/helpers/htmx-alpine.ts:118-137`). Overlays, clipping, responsive layout, and real pointer reachability are unexercised outside the desktop path.

## Why

Keep `navigateViaHtmx()` for its documented headless workaround. Add ONE ordinary Playwright locator click at 1440×900 and 390×844 that asserts the target content becomes visible. This is the minimum coverage for pointer reachability without adding visual-regression infrastructure.

## Where

- tests/e2e/helpers/browser-server.ts (existing viewport helper)
- tests/e2e/flows/browser/ (new canary file)

## Acceptance Criteria

- [ ] One real Playwright `locator().click()` at 1440×900 reaches the target and renders it visible.
- [ ] Same assertion runs at 390×844 (mobile width).
- [ ] Test fails when the control is covered, clipped, or unreachable.
- [ ] Existing `navigateViaHtmx()` workaround remains unchanged.


git issue: 1beae3a
