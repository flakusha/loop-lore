<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Matrix: Frontend ↔ Backend Integration (web UI subsystems × contracts)

**Created:** 2026-10-02
**Scope:** cross-epic integration surface for the **frontend domain** — the 23
frontend-scoped epics (server-rendered htmx + Alpine web UI, its API-contract gate,
and the alternative-frontend cluster) and the contracts that join them.
**Status:** Proposed (design-stage; each gap row names a concrete `src/` surface)
**Tags:** frontend, integration, htmx, alpine, api-contracts, ui

**Epics:** `epic-frontend-backend-integration.md`, `epic-fe-be-harmonization.md`,
`epic-frontend-overview.md`, `epic-frontend-routing.md`, `epic-frontend-headers-management.md`,
`epic-frontend-components.md`, `epic-frontend-component-architecture.md`,
`epic-frontend-html-dedup-htmx-reuse.md`, `epic-frontend-bundle-optimization.md`,
`epic-frontend-login.md`, `epic-frontend-encryption.md`, `epic-frontend-age-gate.md`,
`epic-frontend-notifications.md`, `epic-frontend-internationalization.md`,
`epic-frontend-settings.md`, `epic-frontend-admin.md`, `epic-frontend-gallery.md`,
`epic-frontend-chat-commands.md`, `epic-frontend-emoji-reactions.md`,
`epic-headless-alternative-frontends.md`, `epic-fresh-alternative-frontend.md`,
`epic-embeddable-engine-game-frontend.md`, `epic-game-frontend-scenes.md`

## Domain Systems (enumeration)

Enumerated from `.plan/epics/`: the 18 `epic-frontend-*.md` files plus the
frontend-scoped epics named in the domain sweep (`epic-fe-be-harmonization.md`,
`epic-headless-alternative-frontends.md`, `epic-fresh-alternative-frontend.md`,
`epic-embeddable-engine-game-frontend.md`, `epic-game-frontend-scenes.md`).

| Code   | Epic                                        | Role                                          | Primary `src/` surface                                              |
| ------ | ------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------- |
| FBI    | `epic-frontend-backend-integration.md`      | backend → UI wiring hub (Done)                | `src/frontend/fe-fetch.ts`                                          |
| FBH    | `epic-fe-be-harmonization.md`               | static FE↔BE contract drift gate (In Progress) | `scripts/check-fe-be-harmonization.ts`                             |
| OVR    | `epic-frontend-overview.md`                 | frontend hub / pointer                        | `src/views/layout.html`                                             |
| RTG    | `epic-frontend-routing.md`                  | client-side routing                           | `src/frontend/pages/`, `src/views/layout.html`                      |
| HDR    | `epic-frontend-headers-management.md`       | headers & navigation management               | `src/components/header.html`                                        |
| CMP    | `epic-frontend-components.md`               | shared component library                      | `src/components/`                                                   |
| ARC    | `epic-frontend-component-architecture.md`   | htmx / Alpine responsibility boundaries       | `src/frontend/alpine/`                                              |
| DED    | `epic-frontend-html-dedup-htmx-reuse.md`    | HTML dedup + htmx AJAX reuse                  | `src/frontend/alpine/htmx.ts`, `src/components/loading-state.html`  |
| BND    | `epic-frontend-bundle-optimization.md`      | bundle size / code-splitting                  | `src/frontend/pages.ts`, `scripts/build-frontend.mjs`               |
| LOG    | `epic-frontend-login.md`                    | login / authentication UI                     | `src/views/login.html`, `src/components/auth-form-fields.html`      |
| ENC    | `epic-frontend-encryption.md`               | encryption UI                                 | `src/frontend/browser-crypto.ts`, `src/components/key-management.html` |
| AGE    | `epic-frontend-age-gate.md`                 | age gate & content warnings                   | `src/age-gate/service.ts`                                           |
| NTF    | `epic-frontend-notifications.md`            | notification system UI                        | `src/views/notifications.html`, `src/frontend/stores/ui-store.ts`   |
| I18N   | `epic-frontend-internationalization.md`     | i18n hydration / locale switching             | `src/frontend/i18n.ts`, `src/frontend/locale-init.ts`               |
| SET    | `epic-frontend-settings.md`                 | settings & preferences UI                     | `src/views/settings.html`, `src/components/modals/settings.html`    |
| ADM    | `epic-frontend-admin.md`                    | admin panel & dashboard                       | `src/views/admin.html`, `src/frontend/alpine/admin.ts`              |
| GAL    | `epic-frontend-gallery.md`                  | gallery & media viewer                        | `src/views/gallery.html`, `src/routes/views/gallery.ts`             |
| CMD    | `epic-frontend-chat-commands.md`            | slash-command composer                        | `src/frontend/alpine/chat-actions/command-palette.ts`               |
| EMO    | `epic-frontend-emoji-reactions.md`          | emoji shortcodes + message reactions          | `src/frontend/alpine/chat-messages.ts`                              |
| HDL    | `epic-headless-alternative-frontends.md`    | headless / alternative-frontend hub           | `src/routes/` (API surface)                                         |
| FRS    | `epic-fresh-alternative-frontend.md`        | Fresh.js alternative frontend                 | proposed `loop-lore-fresh-starter/`                                 |
| EMB    | `epic-embeddable-engine-game-frontend.md`   | embeddable engine / game FE hub               | proposed `src/frontend/game/`                                       |
| SCN    | `epic-game-frontend-scenes.md`              | 2D/3D interactive scenes                      | proposed `src/frontend/game/`                                       |

## Integration Matrix

Legend:

- ✅ = both epics reference each other
- ➡️ = row epic references column epic (one-way)
- ⬅️ = column epic references row epic (one-way)
- ❌ = neither epic references the other (gap candidate)
- 🚫 = no meaningful interaction expected (orthogonal surface / different frontend stack)

| System | FBI | FBH | OVR | RTG | HDR | CMP | ARC | DED | BND | LOG | ENC | AGE | NTF | I18N | SET | ADM | GAL | CMD | EMO | HDL | FRS | EMB | SCN |
| ------ | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **FBI** | — | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ⬅️ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **FBH** | ❌ | — | ❌ | ❌ | 🚫 | ❌ | 🚫 | 🚫 | ❌ | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | ❌ | ❌ | ❌ | ❌ |
| **OVR** | ✅ | ❌ | — | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **RTG** | ❌ | ❌ | ❌ | — | ❌ | ❌ | ❌ | ❌ | ❌ | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| **HDR** | ❌ | 🚫 | ❌ | ❌ | — | ❌ | ❌ | ❌ | ❌ | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| **CMP** | ❌ | ❌ | ❌ | ❌ | ❌ | — | ❌ | ❌ | ❌ | 🚫 | 🚫 | 🚫 | ❌ | ❌ | 🚫 | 🚫 | ⬅️ | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| **ARC** | ❌ | 🚫 | ❌ | ❌ | ❌ | ❌ | — | ⬅️ | ❌ | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| **DED** | ➡️ | 🚫 | ❌ | ❌ | ❌ | ❌ | ➡️ | — | ➡️ | 🚫 | 🚫 | 🚫 | 🚫 | ❌ | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| **BND** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ⬅️ | — | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | ❌ | ❌ | ❌ | ❌ |
| **LOG** | ❌ | 🚫 | ❌ | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | — | ❌ | ❌ | 🚫 | 🚫 | 🚫 | ❌ | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| **ENC** | ❌ | 🚫 | ❌ | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | ❌ | — | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | ⬅️ | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| **AGE** | ❌ | 🚫 | ❌ | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | ❌ | 🚫 | — | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| **NTF** | ❌ | 🚫 | ❌ | 🚫 | 🚫 | ❌ | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | — | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | ❌ | ❌ | ❌ | ❌ |
| **I18N** | ❌ | 🚫 | ❌ | 🚫 | 🚫 | ❌ | 🚫 | ❌ | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | — | ❌ | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| **SET** | ❌ | 🚫 | ❌ | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | ❌ | — | ⬅️ | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| **ADM** | ❌ | 🚫 | ❌ | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | ❌ | 🚫 | 🚫 | 🚫 | 🚫 | ➡️ | — | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| **GAL** | ❌ | 🚫 | ❌ | 🚫 | 🚫 | ➡️ | 🚫 | 🚫 | 🚫 | 🚫 | ➡️ | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | — | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| **CMD** | ❌ | 🚫 | ❌ | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | — | ❌ | 🚫 | 🚫 | 🚫 | 🚫 |
| **EMO** | ❌ | 🚫 | ❌ | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | ❌ | — | 🚫 | 🚫 | 🚫 | 🚫 |
| **HDL** | ❌ | ❌ | ❌ | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | ❌ | 🚫 | 🚫 | 🚫 | ❌ | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | — | ✅ | ⬅️ | ⬅️ |
| **FRS** | ❌ | ❌ | ❌ | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | ❌ | 🚫 | 🚫 | 🚫 | ❌ | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | ✅ | — | ❌ | ❌ |
| **EMB** | ❌ | ❌ | ❌ | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | ❌ | 🚫 | 🚫 | 🚫 | ❌ | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | ➡️ | ❌ | — | ✅ |
| **SCN** | ❌ | ❌ | ❌ | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | ❌ | 🚫 | 🚫 | 🚫 | ❌ | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | ➡️ | ❌ | ✅ | — |

## Identified Gaps (by severity)

Every row below is an ❌ or one-way cell that names a concrete cross-system contract
that is missing today. Cells not listed are either ✅/one-way-acceptable or 🚫.

### 🔴 High — missing contract at the frontend↔backend boundary

| #   | System A | System B | Missing cross-system contract | Owning epics | `src/` surface |
| --- | -------- | -------- | ----------------------------- | ------------ | -------------- |
| FB1 | **FBI** (backend→UI wiring) | **FBH** (contract drift gate) | Neither epic references the other. The wiring epic's acceptance "no broken wiring (all frontend calls map to real backend routes)" is exactly what the harmonization gate statically proves — `feFetch`/`apiFetch`/`hx-*` call sites joined to Elysia route literals + TypeBox schemas. The gate must index every route the wiring phases add; the wiring epic must cite the gate as its enforcement. | `epic-frontend-backend-integration.md`, `epic-fe-be-harmonization.md` | `src/frontend/fe-fetch.ts`, `scripts/check-fe-be-harmonization.ts`, `src/routes/` |
| FB2 | **CMD** (slash commands) | **EMO** (emoji/reactions) | Shared composer trigger registry: `/` command autocomplete and `:name:` emoji autocomplete are the same popup, same keyboard contract, and share the Tab-accept ticket — but neither epic references the other. Disallowed/unknown handling must be uniform across both registries. | `epic-frontend-chat-commands.md`, `epic-frontend-emoji-reactions.md` | `src/components/chat/input-area.html`, `src/frontend/alpine/chat-actions/command-palette.ts` |
| FB3 | **ENC** (encryption UI) | **LOG** (login UI) | Encryption's open slice ("receive-decrypt + key-management UI pending") needs a session-bound identity and an unlock/passphrase surface owned by login; login never mentions key material. Define where the user's key unlock sits in the auth flow and how a locked session degrades. | `epic-frontend-encryption.md`, `epic-frontend-login.md` | `src/frontend/browser-crypto.ts`, `src/components/key-management.html`, `src/views/login.html`, `src/components/auth-form-fields.html` |
| FB4 | **HDL** (headless / alt frontends) | **FBH** (contract drift gate) | The gate scans only in-repo `src/frontend/**` + `src/components`/`src/views` HTML. External clients (Fresh, framework SDKs, embeddable) consume `/api/*` with no contract gate — the class of drift the gate exists to catch is unguarded the moment a second frontend ships. Define the published API contract (OpenAPI/versioned types) as the gate for non-htmx clients. | `epic-headless-alternative-frontends.md`, `epic-fe-be-harmonization.md` | `scripts/check-fe-be-harmonization.ts`, `src/routes/`, proposed `packages/` |

### 🟡 Medium — one-way links or missing cross-references

| #    | System A | System B | Missing cross-system contract | Owning epics | `src/` surface |
| ---- | -------- | -------- | ----------------------------- | ------------ | -------------- |
| FB5  | **RTG** (routing) | **HDR** (headers/nav) | Same navigation surface: route table and header/nav state are one contract (active link, breadcrumb, htmx-history). Neither epic references the other; both are unscoped stubs. | `epic-frontend-routing.md`, `epic-frontend-headers-management.md` | `src/components/header.html`, `src/views/layout.html` |
| FB6  | **I18N** (i18n) | **CMP** / **DED** (components, htmx reuse) | Server-rendered partials must re-hydrate translations after every htmx swap (`Alpine.initTree()` path); i18n does not reference the component library or the htmx lifecycle owner. Define `data-i18n` hydration in the swap lifecycle. | `epic-frontend-internationalization.md`, `epic-frontend-components.md`, `epic-frontend-html-dedup-htmx-reuse.md` | `src/frontend/i18n.ts`, `src/frontend/locale-init.ts`, `src/frontend/alpine/htmx.ts`, `src/components/` |
| FB7  | **NTF** (notifications UI) | **CMP** (components) | Notification toasts/overlays build on the shared overlay stack + UI store; the notifications epic has no scope at all and never names the component library. | `epic-frontend-notifications.md`, `epic-frontend-components.md` | `src/views/notifications.html`, `src/components/overlay-stack.html`, `src/frontend/stores/ui-store.ts` |
| FB8  | **I18N** (i18n) | **SET** (settings) | Locale/language preference is a settings section; neither epic references the other. Define where locale is chosen, persisted, and applied to already-rendered pages. | `epic-frontend-internationalization.md`, `epic-frontend-settings.md` | `src/views/settings.html`, `src/components/modals/settings.html`, `src/frontend/locale-init.ts` |
| FB9  | **ARC** (component architecture) | **BND** (bundle) | Lazy `import()` code-splitting of Alpine components is an architecture decision (which components register eagerly vs on demand); bundle optimization defines the splitting targets but component-architecture is an unscoped stub. | `epic-frontend-component-architecture.md`, `epic-frontend-bundle-optimization.md` | `src/frontend/pages.ts`, `src/frontend/app.ts`, `scripts/build-frontend.mjs` |
| FB10 | **ADM** (admin) | **LOG** (login UI) | Admin user management revokes sessions / resets passwords / disables accounts — the auth surface the login epic owns; admin references settings one-way and never login. | `epic-frontend-admin.md`, `epic-frontend-login.md` | `src/routes/admin/users.ts`, `src/frontend/alpine/admin-users.ts`, `src/views/login.html` |
| FB11 | **OVR** (frontend hub) | all FE subsystems | The declared hub references only the wiring epic. It should index the frontend subsystems (routing, headers, components, i18n, notifications, settings, admin, gallery, composer) so the domain has one entry point. | `epic-frontend-overview.md` | `src/views/layout.html` |

### 🟢 Low — peripheral cross-references

| #    | System A | System B | Missing cross-system contract | Owning epics | `src/` surface |
| ---- | -------- | -------- | ----------------------------- | ------------ | -------------- |
| FB12 | **DED** (html dedup) | **CMP** (components) | Dedup references component-architecture but not the component library where extracted partials actually land. | `epic-frontend-html-dedup-htmx-reuse.md`, `epic-frontend-components.md` | `src/components/`, `src/partials/`, `src/frontend/alpine/htmx.ts` |
| FB13 | **AGE** (age gate) | **LOG** (login UI) | Age verification is an entry-flow gate adjacent to login; neither epic references the other. Define whether the age gate precedes auth or runs per-session. | `epic-frontend-age-gate.md`, `epic-frontend-login.md` | `src/age-gate/service.ts`, `src/views/login.html`, `src/routes/views/` |
| FB14 | **GAL** (gallery) | **CMP** (components) | Gallery references the component library one-way (modals/buttons/badges); the component library never lists the gallery modals it hosts. One-way is acceptable; noted for completeness. | `epic-frontend-gallery.md`, `epic-frontend-components.md` | `src/partials/gallery/preview-modal.html`, `src/components/asset-preview-modal.html` |

## Shared Data Contracts

- **`feFetch` call-site descriptor** — `{ method, normalizedPath, ref, file:line }`; the join key between `src/frontend/**` call sites and Elysia registrations in `scripts/check-fe-be-harmonization.ts`. Consumed by FBH, produced by every UI epic's `src/frontend/alpine/**` component.
- **htmx swap lifecycle** — `AfterSwap → Alpine.initTree()` + OOB handling, centralized in `src/frontend/alpine/htmx.ts`; the hook every server-rendered partial (CMP/DED/I18N/GAL) must reuse.
- **UI store** — `src/frontend/stores/ui-store.ts` (overlay/toast state); shared by NTF, CMP, GAL modals.
- **Composer trigger registry** — unified `/` command + `:emoji:` autocomplete contract over `src/components/chat/input-area.html`; shared by CMD + EMO.
- **Browser crypto boundary** — `src/frontend/browser-crypto.ts` (AES-GCM client encrypt/decrypt); shared by ENC + GAL private-asset preview, gated by LOG session identity.
- **Page bundle entry** — `src/frontend/pages.ts` + `src/frontend/pages/*`; the code-split boundary shared by RTG + BND.

## Integration Points Status

`## Integration Points` sections (standardized template from `matrix-cross-mechanics.md`)
were added to the frontend epics that carried a real, evidence-backed cross-system
surface: FBI, FBH, RTG, HDR, CMP, ARC, DED, BND, LOG, ENC, AGE, NTF, I18N, SET, ADM,
GAL, CMD, EMO.

Left without a new section (already carry an equivalent explicit dependency block, or
are pointer hubs whose deps are their sub-epics):

- `epic-frontend-overview.md` — pointer hub; indexes `epic-frontend-backend-integration.md` only (see FB11).
- `epic-headless-alternative-frontends.md` — hub with an explicit Sub-Epics table + shared-interface block.
- `epic-fresh-alternative-frontend.md` — explicit Dependencies + Related Epics block.
- `epic-embeddable-engine-game-frontend.md` — hub with Sub-Epics table + sequencing.
- `epic-game-frontend-scenes.md` — sub-epic with explicit Dependencies block.

## Related Matrices

- `matrix-cross-mechanics.md` — RPG cross-mechanics (G1–G47) + the standardized `## Integration Points` template.
- `matrix-authentication-channels.md` — auth channels; already treats `epic-frontend-notifications.md` as an in-app channel.
- `matrix-story-coherence.md`, `matrix-emotion-avatar-assets.md` — sibling domain matrices.
