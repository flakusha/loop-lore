<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Server Lifecycle Hardening

**Overview:** (see sections below)

**Status:** Not Started
**Priority:** P2
**Effort:** Medium
**Type:** Bug Epic / Hardening
**Tags:** server, lifecycle, shutdown, boot, hardening
**Issue:** (none)

## Summary

The server's lifecycle edges — boot readiness, background-init failures,
shutdown, and resource cleanup — behave inconsistently: uncaught exceptions do
not force a non-zero exit, rejected background-init promises vanish without a
module name, traffic can arrive before plugins/seeds/assets are ready, docs
serving ignores its config gate, the regex-telemetry flush timer is never
cleared on app stop, and hot HTML entry points are re-rendered per request with
no caching. `epic-runtime-integrity-fail-safes` covered the earlier fail-safe
class and is Done; the remaining lifecycle defects have no owner. This epic
closes them as one scoped class: a boot that becomes ready only when it is
ready, a shutdown that fails loudly and cleans up its timers, and serving paths
that respect their config gates and cost.

## Scope

1. **Shutdown**: exit non-zero on `uncaughtException`/`unhandledRejection`
   shutdown; track and clear the regex-telemetry flush timer on app stop.
2. **Boot visibility**: log every rejected background-init promise with module +
   error; gate traffic until plugins/seeds/assets are ready or document the
   boot window as accepted behavior.
3. **Config-gated serving**: gate docs serving on config and redirect `/docs`
   to `/docs/`.
4. **Serving cost**: stop re-rendering/leaking hot HTML entry points; stream
   static files with caching.

## Tasks

- [ ] `BUG-fix-server-exit-non-zero-on-uncaughtexception-unhandledrejec` — non-zero shutdown exit
- [ ] `BUG-fix-server-track-and-clear-the-regex-telemetry-flush-timer-o` — timer cleanup on stop
- [ ] `BUG-fix-server-log-rejected-background-init-promises-with-module` — init-failure logging
- [ ] `BUG-fix-server-gate-traffic-until-plugins-seeds-assets-are-ready` — readiness gate
- [ ] `BUG-fix-server-gate-docs-serving-on-config-redirect-docs-to-docs` — docs gate + redirect
- [ ] `TASK-perf-server-no-cache-html-entry-points-stream-static-files-w` — hot-path caching/streaming

## Acceptance Criteria

- [ ] Uncaught exception / unhandled rejection during shutdown exits non-zero
- [ ] Rejected background-init promises are logged with module name and error
- [ ] No request is served before plugins/seeds/assets init completes (or the window is documented as accepted)
- [ ] Docs serving honors its config gate; `/docs` redirects to `/docs/`
- [ ] Regex-telemetry flush timer is cleared on app stop (no dangling handle)
- [ ] Hot HTML entry points are cached and static files streamed, with a test covering the cache hit path

## Related Epics

- `epic-certificate-and-tls-management.md` — TLS fail-closed provisioning (cluster bug re-homed there)
- `epic-runtime-integrity-fail-safes.md` — earlier (Done) fail-safe class; this epic covers the remainder
- `epic-continuous-improvement.md` — sibling hardening/review-rule work

## Bind Tickets

- `BUG-fix-server-exit-non-zero-on-uncaughtexception-unhandledrejec.md` (open)
- `BUG-fix-server-gate-docs-serving-on-config-redirect-docs-to-docs.md` (open)
- `BUG-fix-server-gate-traffic-until-plugins-seeds-assets-are-ready.md` (open)
- `BUG-fix-server-log-rejected-background-init-promises-with-module.md` (open)
- `BUG-fix-server-track-and-clear-the-regex-telemetry-flush-timer-o.md` (open)
- `TASK-perf-server-no-cache-html-entry-points-stream-static-files-w.md` (open)


git issue: 5ca048c
