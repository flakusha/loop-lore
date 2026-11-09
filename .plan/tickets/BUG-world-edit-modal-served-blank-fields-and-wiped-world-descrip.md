<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: World edit modal served blank fields and wiped world description/lore

**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-world-management-ui
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Symptom: the world-detail page's Edit button opened a modal whose name/description/lore fields were all blank. Saving it silently wiped the world's description and lore.

Root cause: the Edit button loaded a STATIC, DB-less partial (src/partials/worlds/edit-modal.html) through the GET partials route (src/routes/views/plugin-static.ts:12-27 -> src/routes/views/static-partials.ts:14-35), which never resolves includes and never reads the world row - the input at :26 carried no value and the textareas at :31-39 and :48-56 were empty, and the text-toolbar includes at :41 and :58 were rendered verbatim. The form PUT to the world update route (src/partials/worlds/edit-modal.html:17) with those empty fields, and the handler writes any non-null field, so description and lore were overwritten with empty strings.

Fix: keep the modal and make it show the world's CURRENT values. The partial stays DB-less, so the modal prefills itself client-side: a new Alpine component (src/frontend/alpine/world-edit-modal.ts, mounted with x-data="worldEditModal()" on the modal root) reads the world id from the form's own PUT target (/api/v1/worlds/{{worldId}}) and loads the world through the access-checked GET /api/v1/worlds/:id (src/frontend/alpine/world-fetch.ts), writing name/description/lore into the three fields. The Save button ships disabled and is only enabled once the values are loaded, so a world that cannot be loaded can never be submitted empty. The server keeps its semantics - a non-null field is written as sent - so a field the user clears on purpose is still cleared; the accidental-empty path is closed on the client, the only side that can tell "cleared" from "never loaded".

Verification: src/frontend/alpine/world-edit-modal.test.ts mounts the component against the real API response shape and asserts the fields end up holding the world's current name/description/lore, that an untouched save submits them unchanged instead of clearing them, and that a world which fails to load leaves Save disabled and the fields empty; a fourth test asserts the served partial still wires the prefill and ships Save disabled, and a fifth asserts the name input's maxlength still matches the backend schema's Name.maxLength. bun test src/frontend/alpine, bun test src/routes/views, typecheck, typecheck:frontend, eslint, dprint, size and i18n gates green.

**Context:**

Why: the Edit button on the world-detail page loads a static, DB-less partial, so the modal's fields arrive blank; the PUT then writes those blanks over the world's row and the description and lore are gone. The full-page editor at /worlds/:id/edit already prefills from the same endpoint, so the fix reuses that data path instead of adding one.

What changed:
- src/frontend/alpine/world-edit-modal.ts (new) - the Alpine component plus prefillWorldEditModal(); loads the world with the existing fetchWorldJson helper and fills #edit-name, #edit-description and #edit-lore.
- src/frontend/alpine/index.ts - registers the module in the Alpine bundle.
- src/partials/worlds/edit-modal.html - x-data="worldEditModal()", id="edit-world-form", and a Save button that ships disabled and is enabled once the world is loaded.
- src/frontend/alpine/world-edit-modal.test.ts (new) - the regression test.
- src/partials/worlds/edit-modal.html, src/partials/worlds/create-modal.html, src/views/world-edit.html - the name input mirrors the API's limit (maxlength="255") on every world surface, so an over-long name cannot turn the whole save into a 422 that drops the description and lore edits with it.
- docs/frontend/worlds.md - documents the modal surface, its prefill and the fields' real limits.

Constraints: no new endpoint, no backend change, no new dependency - the modal is served by the static partial route, which has no database handle.

Backend authority: the API stays the source of truth for every field it writes - the route validates the body against WorldUpdateBody (name 1..255 via Name; description and lore any string, with "" meaning a deliberate clear) before the handler writes it, and the frontend now mirrors those limits exactly. The one rule with no server-side expression is "a client must not send a value it never loaded": an empty string is a legitimate clear, so the server cannot tell a clear-on-purpose from a clear-by-accident. Making that server-authoritative needs an API-contract change - WorldUpdateBody would grow explicit clearDescription/clearLore flags, the schema would reject an empty string otherwise, and every caller (the full-page editor, this modal, any external client) would have to adopt them. Named as the follow-up rather than done here: it changes a published contract beyond this defect.

Rejected: rendering the modal server-side (a route with a database handle plus the world access checks) - the client-side prefill reuses the already-shipped access-checked endpoint and needs no new route; deleting the modal in favour of the full-page editor (the original plan in this ticket) - that replaces the surface the world-detail page links to, which is outside this lane's scope, and the modal stays reachable from that page.

Still open (a separate defect, untouched here): the static partial route never resolves {{> ... }} includes, so this modal - and the world's create modal and create wizard - render the text-toolbar include verbatim.

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
