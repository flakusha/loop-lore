<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: First-run welcome surface (getting-started banner)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-provider-connection-wizard
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Dismissible banner on main chat view when /api/v1/setup/state reports ok:false, linking to wizard entry point and /doctor. Auto-dismisses once ok:true. Depends on C2. Gap G12.

**Context:**

Gap G12 of `.tmp/research/AutoSetup-GapAudit-2026-11-15.md:132-140`: no ticket covers a general first-run landing surface. Verified 2026-11-15: `grep -rni "firstRun|first_run|welcome" src/frontend src/views` returns only unrelated hits — the i18n placeholder `chats.welcomeTitle` (an empty-chat title, `src/frontend/alpine/chat-management.ts:29`) and `welcomeMessage` (a character greeting field, `src/frontend/pages/characters-edit-form.ts:59`). `src/views` has zero matches. There is no first-run detection, getting-started surface, or setup banner anywhere in the frontend. The provider wizard (C5) covers provider connection only; the boot-readiness log line is not a user surface. This ticket is the frontend entry point into both.

Contract facts the implementation MUST respect (verified 2026-11-15 against the shipped code, not assumed):

- **The endpoint has no top-level `ok`.** `GET /api/v1/setup/state` returns `{ checks: [{ id, ok, hint? }] }` — `src/routes/setup/routes.ts:21-27`, TypeBox schema inline; six checks in a stable order, `id`/`ok`/`hint?`. "reports ok:false" therefore means **any check has `ok:false`**, not a single boolean. The banner must aggregate over `checks` (e.g. `checks.some(c => !c.ok)`), never read a top-level `ok`.
- **The endpoint is admin-gated, default-deny.** `requirePermissionUserId(ctx, "admin.system")` returns 401 for an anonymous caller and 403 for a non-admin (`src/routes/setup/routes.ts:37-38`; negative paths asserted in `src/routes/setup/routes.test.ts:79-91`). The main chat view is NOT admin-only, so a plain client fetch of this endpoint will 401/403 for most users. The banner must treat 401/403 as "no banner" (unknown state), never as "setup is broken" and never as a client-side error toast. See the anonymous-allowed-pages ticket (`d533dc6`) for the opt-in that would let non-admins read booleans — until that lands, the banner can only be populated for admins (or from a server-rendered/proxied value).
- **`/doctor` is not an HTTP route.** There is no `/doctor` endpoint or page in `src/` (grep: the only hit is a comment in `src/routes/setup/checks.ts:13`). `/doctor` is the assistant slash command tracked by `TASK-assistant-doctor-command-rendering-setup-state-checks.md` (Not Started) — the banner's doctor link must point at the assistant command surface, and the banner must not link to a URL that does not exist.
- **The wizard entry point is the admin provider wizard** — `src/frontend/alpine/admin-provider-wizard/` (`createProviderWizard` in `src/frontend/alpine/admin.ts:16`), opened from the admin surface. The wizard already consumes the setup-state endpoint defensively: `src/frontend/alpine/admin-provider-wizard/api.ts:169-174` treats the endpoint as optional and tolerates its absence ("optional endpoint, may not exist yet"), with a 404/network-down path covered in `api.test.ts` and `index.test.ts:365`. The banner must use the same tolerant-client discipline — a missing or failing endpoint means no banner, not an error.
- **Banner placement.** `src/views/chat.html:11-13` includes the overlay stack above `.chat-container` (comment: "overlay stack lives ABOVE .chat-container so banners / toasts / tickers are position:fixed and never shift the chat scroll position"); the partial is `src/components/overlay-stack.html`. The banner belongs in that overlay stack, not inline in the chat scroll flow. **But the existing banner slot is a single shared string, not a slot for this banner.** `src/components/overlay-stack.html:19-38` renders `$store.ui.banner` — one plain-text field (`src/frontend/stores/ui-store.ts:81`, `banner: ""`) with a close button that merely clears the string (`@click="$store.ui.banner = ''"`). It carries no links, no persistence, and any other writer would clobber it; today it has no writer at all (grep for `ui.banner` finds only the component itself). The welcome banner therefore needs its own component + state (a dedicated partial or a dedicated store field), NOT the shared `ui.banner` string — and its dismissal must survive reload, which the shared slot never did.
- **Existing dismiss precedents** (for the interaction pattern, not the state key): `dismissRestartBanner()` in `src/views/admin.html:1607` and `src/views/settings.html:65`.
- **Dismissal is a client-side preference.** There is no server-side dismissal store, and no "first run" marker exists in the DB (Gap G10 explicitly defers a first-run branch). "Auto-dismisses once ok:true" therefore means: while `ok:true`, the banner is not rendered at all (no dismissal to persist); a manual dismiss must persist across reloads (localStorage or an existing settings mechanism) and must not resurrect on the next page load while setup is still incomplete — unless the operator wants re-prompting, which is an open decision recorded below.
- **The wizard epic's Open Question #1 is this ticket.** `epic-provider-connection-wizard.md` Open Questions #1: "Wizard entry point on fresh installs: auto-open on first admin visit vs a settings-page banner only (setup-state `ok:false` checks make either triggerable; decide at implementation)". This ticket is where that decision lands; the epic's answer must be updated to point at this ticket.

Alternatives considered:

- A dedicated first-run landing page instead of a banner — rejected: it adds a new route and a second entry point, while the epic's anti-goal is explicitly "no Jellyfin-length multi-screen funnel" (two screens max, skippable at every point).
- Reusing the admin `dismissRestartBanner()` pattern wholesale — rejected: that banner is admin-scoped; the chat view is user-scoped, and the state key must not collide.
- Server-side dismissal persistence in the DB — rejected for this ticket: it needs a schema migration for a UI preference, and the epic's philosophy keeps setup surfaces skippable and stateless. Revisit only if re-prompting proves necessary.

**Do NOT touch:**

- Do NOT modify the setup-state endpoint's shape, guard, or check set (`src/routes/setup/routes.ts`, `src/routes/setup/checks.ts`) — it is the single source consumed by the readiness summary, `/doctor` and the wizard. The banner is a consumer, never a second source of setup truth.
- Do NOT add a parallel setup-check computation in the frontend. The banner reads the endpoint's checks; it does not re-derive `ok` locally.
- Do NOT widen the endpoint's anonymous exposure to make the banner work for everyone — that is `d533dc6`'s scope, under its own opt-in.
- Do NOT build a `/doctor` HTTP route — the assistant command owns that surface.

**Acceptance Criteria:**

- [ ] the banner renders in the chat view's overlay stack (never inside the scrolling chat flow) when any `GET /api/v1/setup/state` check has `ok:false`
- [ ] the banner does NOT use the shared `$store.ui.banner` string slot (`src/frontend/stores/ui-store.ts:81`): it has its own component and its own state, so no other overlay writer can clobber it
- [ ] the banner is computed from the endpoint's `checks` array (`checks.some(c => !c.ok)`); no top-level `ok` is read and no check logic is re-implemented client-side
- [ ] a 401, 403, 404, or network failure from the endpoint renders NO banner and raises NO error toast (state is "unknown", not "broken")
- [ ] while every check reports `ok:true`, the banner is not rendered at all (auto-dismiss without persisting a dismissal)
- [ ] a manual dismiss persists across page reloads while setup is still incomplete, and does not collide with the admin `dismissRestartBanner()` state key
- [ ] the banner links to the wizard entry point (admin provider wizard) and to the `/doctor` assistant command surface — no link points at a non-existent `/doctor` URL
- [ ] the endpoint is fetched through the same tolerant-client pattern as `src/frontend/alpine/admin-provider-wizard/api.ts:169-174` (optional endpoint, absent tolerated)
- [ ] unit test covers: any-check-not-ok renders the banner; all-ok renders nothing; 401/403 renders nothing; endpoint absent renders nothing
- [ ] `epic-provider-connection-wizard.md` Open Questions #1 is updated to record the banner decision and points at this ticket
- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
