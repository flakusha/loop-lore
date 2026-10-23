<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Docs drift — login body, `lolo -h`, OpenAPI coverage, stale specs

**Status:** Done

**Resolution:**
- Item 1 (login contract): fixed in `docs/reference/api.md` — auth section + login/demo-login/register/logout/me entries now document the form-encoded + `ll_token` cookie + `HX-Redirect` contract (JSON bodies rejected 4xx; htmx swap vs JSON envelope via `Accept`).
- Item 2 (`lolo -h` F1/F6): already landed in d50175a29 — verified present in `bin/lolo.ts` header docstring + `printHelp()`; box checked, no further edit.
- Item 3 (OpenAPI detail tags): deferred-with-reason — regenerating the spec shows 690 paths / ~800 untagged operations across dozens of route files (chats, assets, nsfw, admin, generation, …), not "a few detail tags on the largest groups". Tagging at that scale is a multi-file code change, not a docs fix; no baseline update made (baseline still 108, gate passes with no drift).
- Item 4 (api-routes spec): fixed in `docs/spec/api-routes.md` — v1 paths, `/api/sessions` + switch routes documented, Bearer claim corrected to cookie-only (federation-only Bearer), v2 marked planned-new with the deprecation-header Link explained as naming a future version; also fixed the stale signed-url path and mount description.
**Summary:** Fix four documented-vs-implemented drifts found by the audit.
**Context:** Gap 3. Sources: `.tmp/interaction-surfaces.md` §1.2/§8, `.tmp/interaction-surfaces-ui.md` verification appendix.
**Acceptance Criteria:** Each drift below is fixed in code or docs; `scripts/check/*` gates (if present for these files) pass.

**Epic:** epic-interaction-surfaces-audit.md
**Type:** Docs | **Priority:** Medium | **Effort:** S

## Problem

1. `docs/reference/api.md` documents JSON `{ username, password }` login with `{ token, user }` response — implemented login/register/demo-login are **form-encoded only** (`parse: "none"`, cookie + `HX-Redirect`). JSON POST is rejected.
2. `bin/lolo.ts` `-h` lists only F2/F3/F5; omits **F1 (chat picker)** and **F6 (models overlay)** (`src/tui/app-keys.ts` authoritative).
3. `GET /api/v1/openapi/json` covers only `detail`-tagged routes (~109 of ~350 templated routes per `scripts/check/api-doc-drift-baseline.json`).
4. `docs/spec/api-routes.md` describes pre-v1 `/api/{resource}` shape and claims `/api/sessions` does not exist (it does). Deprecation header points at `/api/v2` which does not exist (`src/routes/v2/` absent).

## Change

- (1): correct `docs/reference/api.md` to form-encoded login + cookie contract (or add JSON login — prefer docs fix; adding a token endpoint is a new auth surface, out of scope).
- (2): update `bin/lolo.ts` help text to list F1/F6.
- (3): tag the largest untagged route groups with `detail.summary/tags` to raise OpenAPI coverage; update the drift baseline file.
- (4): update `docs/spec/api-routes.md` to v1 paths; either remove the `/api/v2` successor link or mark it planned-new.

## Acceptance

- All four items fixed; no documented endpoint/command/route that does not exist, and the v2 link is gone or explicitly planned-new.
- `bun run openapi` output diff matches the updated baseline.

## Non-goals

- Adding JSON login / token endpoint (new auth surface). Building v2.
