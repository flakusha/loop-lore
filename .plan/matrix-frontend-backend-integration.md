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
| **FBI** | — | ✅ | ✅ | ➡️ | ❌ | ➡️ | ❌ | ⬅️ | ❌ | ❌ | ❌ | ❌ | ➡️ | ❌ | ❌ | ➡️ | ➡️ | ➡️ | ➡️ | ❌ | ❌ | ❌ | ❌ |
| **FBH** | ✅ | — | ❌ | ➡️ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ➡️ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **OVR** | ✅ | ❌ | — | ⬅️ | ⬅️ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **RTG** | ⬅️ | ⬅️ | ➡️ | — | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **HDR** | ❌ | ❌ | ➡️ | ✅ | — | ➡️ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **CMP** | ⬅️ | ❌ | ❌ | ✅ | ⬅️ | — | ⬅️ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **ARC** | ❌ | ❌ | ❌ | ❌ | ❌ | ➡️ | — | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **DED** | ➡️ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | — | ✅ | ❌ | ❌ | ❌ | ❌ | ⬅️ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **BND** | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ | — | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ➡️ | ❌ | ❌ | ❌ |
| **LOG** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | — | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **ENC** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | — | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **AGE** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | — | ❌ | ❌ | ➡️ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **NTF** | ⬅️ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | — | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ➡️ | ❌ | ❌ | ❌ |
| **I18N** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ➡️ | ❌ | ❌ | ❌ | ❌ | ❌ | — | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **SET** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ⬅️ | ❌ | ✅ | — | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **ADM** | ⬅️ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | — | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **GAL** | ⬅️ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | — | ❌ | ⬅️ | ❌ | ❌ | ❌ |
| **CMD** | ⬅️ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | — | ✅ | ❌ | ❌ | ❌ |
| **EMO** | ⬅️ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ➡️ | ✅ | — | ❌ | ❌ | ❌ | ❌ |
| **HDL** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ⬅️ | ❌ | ❌ | ❌ | ⬅️ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | — | ✅ | ⬅️ | ⬅️ |
| **FRS** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | — | ❌ | ❌ |
| **EMB** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ➡️ | ❌ | — | ✅ |
| **SCN** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ➡️ | ❌ | ✅ | — |

## Identified Gaps (by severity)

Every row below is an ❌ or one-way cell that names a concrete cross-system contract
that is missing today. Cells not listed are either ✅/one-way-acceptable or 🚫.

### 🔴 High — missing contract at the frontend↔backend boundary

| #   | System A | System B | Missing cross-system contract | Owning epics | `src/` surface |
| --- | -------- | -------- | ----------------------------- | ------------ | -------------- |
| FB1 | **HDL** (headless / alt frontends) | **FBH** (contract drift gate) | The gate scans only in-repo `src/frontend/**` + `src/components`/`src/views` HTML. External clients (Fresh, framework SDKs, embeddable) consume `/api/*` with no contract gate — the class of drift the gate exists to catch is unguarded the moment a second frontend ships. Define the published API contract (OpenAPI/versioned types) as the gate for non-htmx clients. | `epic-headless-alternative-frontends.md`, `epic-fe-be-harmonization.md` | `scripts/check-fe-be-harmonization.ts`, `src/routes/`, proposed `packages/` |
| FB2 | **HDL** (headless / alt frontends) | **LOG** (login UI) | Headless clients need session auth (token provisioning, refresh, logout) but never reference the login epic. Define the auth flow for non-htmx clients: how tokens are obtained, stored, and refreshed outside the browser session. | `epic-headless-alternative-frontends.md`, `epic-frontend-login.md` | `src/routes/`, `src/views/login.html`, `src/components/auth-form-fields.html` |

### 🟡 Medium — one-way links or missing cross-references

| #    | System A | System B | Missing cross-system contract | Owning epics | `src/` surface |
| ---- | -------- | -------- | ----------------------------- | ------------ | -------------- |
| FB3  | **OVR** (frontend hub) | all FE subsystems | The declared hub references only the wiring epic. It should index the frontend subsystems (routing, headers, components, i18n, notifications, settings, admin, gallery, composer) so the domain has one entry point. | `epic-frontend-overview.md` | `src/views/layout.html` |
| FB4  | **RTG** (routing) | **ARC** (component architecture) | Client-side routing and the htmx/Alpine responsibility boundary are related: route transitions trigger swaps that must respect the architecture's ownership rules. Neither epic references the other. | `epic-frontend-routing.md`, `epic-frontend-component-architecture.md` | `src/frontend/pages/`, `src/frontend/alpine/` |
| FB5  | **RTG** (routing) | **DED** (html dedup / htmx reuse) | Route transitions trigger htmx swaps; the swap lifecycle (AfterSwap → Alpine.initTree()) is owned by DED. Routing must reference the swap lifecycle for OOB handling and dedup. | `epic-frontend-routing.md`, `epic-frontend-html-dedup-htmx-reuse.md` | `src/frontend/alpine/htmx.ts`, `src/frontend/pages/` |
| FB6  | **HDR** (headers/nav) | **ARC** (component architecture) | Header/nav components are part of the component architecture; the architecture's ownership rules must cover them. Neither epic references the other. | `epic-frontend-headers-management.md`, `epic-frontend-component-architecture.md` | `src/components/header.html`, `src/frontend/alpine/` |
| FB7  | **CMP** (components) | **BND** (bundle) | Shared components are the primary code-splitting targets; bundle optimization must reference the component library to define which components load eagerly vs on demand. | `epic-frontend-components.md`, `epic-frontend-bundle-optimization.md` | `src/components/`, `src/frontend/pages.ts` |
| FB8  | **LOG** (login) | **NTF** (notifications) | Login success/failure should trigger notifications (welcome back, failed attempt alert); the login epic never references the notification system. | `epic-frontend-login.md`, `epic-frontend-notifications.md` | `src/views/login.html`, `src/views/notifications.html`, `src/frontend/stores/ui-store.ts` |
| FB9  | **LOG** (login) | **GAL** (gallery) | Private gallery assets require auth; the gallery epic never references the login epic. Define how auth state gates gallery access. | `epic-frontend-login.md`, `epic-frontend-gallery.md` | `src/views/gallery.html`, `src/routes/views/gallery.ts`, `src/views/login.html` |
| FB10 | **I18N** (i18n) | **NTF** (notifications) | Notification messages must be translatable; the i18n epic never references the notification system. Define the i18n key namespace for notifications. | `epic-frontend-internationalization.md`, `epic-frontend-notifications.md` | `src/frontend/i18n.ts`, `src/views/notifications.html` |
| FB11 | **SET** (settings) | **NTF** (notifications) | Notification preferences (mute, quiet hours, channel selection) are a settings section; neither epic references the other. | `epic-frontend-settings.md`, `epic-frontend-notifications.md` | `src/views/settings.html`, `src/components/modals/settings.html`, `src/views/notifications.html` |
| FB12 | **ADM** (admin) | **NTF** (notifications) | Admin actions (ban, delete, role change) should notify affected users; the admin epic never references the notification system. | `epic-frontend-admin.md`, `epic-frontend-notifications.md` | `src/views/admin.html`, `src/frontend/alpine/admin.ts`, `src/views/notifications.html` |
| FB13 | **HDL** (headless / alt frontends) | **I18N** (i18n) | Headless clients need locale selection and translation hydration; the headless epic never references the i18n epic. | `epic-headless-alternative-frontends.md`, `epic-frontend-internationalization.md` | `src/routes/`, `src/frontend/i18n.ts`, `src/frontend/locale-init.ts` |
| FB14 | **HDL** (headless / alt frontends) | **SET** (settings) | Headless clients need settings persistence and retrieval; the headless epic never references the settings epic. | `epic-headless-alternative-frontends.md`, `epic-frontend-settings.md` | `src/routes/`, `src/views/settings.html` |

### 🟢 Low — peripheral cross-references

| #    | System A | System B | Missing cross-system contract | Owning epics | `src/` surface |
| ---- | -------- | -------- | ----------------------------- | ------------ | -------------- |
| FB15 | **FRS** (Fresh frontend) | **LOG** (login UI) | Fresh.js frontend needs auth; never references the login epic. | `epic-fresh-alternative-frontend.md`, `epic-frontend-login.md` | proposed `loop-lore-fresh-starter/`, `src/views/login.html` |
| FB16 | **EMB** (embeddable engine) | **LOG** (login UI) | Embeddable engine may need auth for saved games; never references the login epic. | `epic-embeddable-engine-game-frontend.md`, `epic-frontend-login.md` | proposed `src/frontend/game/`, `src/views/login.html` |
| FB17 | **SCN** (game scenes) | **LOG** (login UI) | Game scenes may need auth for saved state; never references the login epic. | `epic-game-frontend-scenes.md`, `epic-frontend-login.md` | proposed `src/frontend/game/`, `src/views/login.html` |

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

- `epic-frontend-overview.md` — pointer hub; indexes `epic-frontend-backend-integration.md` only (see FB3).
- `epic-headless-alternative-frontends.md` — hub with an explicit Sub-Epics table + shared-interface block.
- `epic-fresh-alternative-frontend.md` — explicit Dependencies + Related Epics block.
- `epic-embeddable-engine-game-frontend.md` — hub with Sub-Epics table + sequencing.
- `epic-game-frontend-scenes.md` — sub-epic with explicit Dependencies block.

## Related Matrices

- `matrix-cross-mechanics.md` — RPG cross-mechanics (G1–G47) + the standardized `## Integration Points` template.
- `matrix-authentication-channels.md` — auth channels; already treats `epic-frontend-notifications.md` as an in-app channel.
- `matrix-story-coherence.md`, `matrix-emotion-avatar-assets.md` — sibling domain matrices.
