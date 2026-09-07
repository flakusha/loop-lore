<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Opt-in `ask`-Type Chat Event for Direct User Interactions + Story Development

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Type:** Feature Task
**Tags:** chat, ask-type, fast-menu, modals, choices, trade, inventory, battle, transition, modal-above-chat, user-action, opt-in
**Epic:** epic-game-frontend-scenes.md (parent: epic-embeddable-engine-game-frontend.md)

## Summary

Introduce a new chat-level `messages.content_type = 'ask'` event — a fast-action menu rendered above the chat window that lets the user trigger direct interactions (open inventory, start barter/trade, enter battle, transition to another location, open a custom modal) **without** typing a free-form prompt. Every interaction declared by the system's existing UI surfaces (trade routes, battle routes, location-transfer routes, inventory routes) becomes one click away.

The current VN choice-card system (`src/frontend/vn/choice-cards.ts`, `src/chat/service/vn-choices.ts`, table `vn_choices`) is **scene-index-bound** and **post-LLM-generation** — choices are produced by the LLM, made available on scene advance, and disappear once one is selected. The `ask` type generalizes the same UI pattern **outside the VN constraint**: works in any chat mode (direct, group, RPG, agentic), bound to the **chat itself** (not scene index), and surface-initiated (system-computed from current chat state: location, inventory, participants, world rules) **plus** user-curated via opt-in.

## Why this ticket exists (the gap)

1. **No fast-action menu in chat today** — the only UIS-driven entrypoints to trade/battle/inventory are deep navigation routes; users must context-switch away from chat to interact.
2. **VN choices are scene-locked** — `vn_choices.scene_index` ties them to a specific LLM-generated scene; no mechanism to surface interaction choices outside an active scene.
3. **Modal surface above the chat is unused for chat events** — `chat_modals` (if any) are scoped to system modals (consent, age gate), not per-message interactions.
4. **No opt-in lifecycle** — existing UI surfaces (e.g., "Start trade") appear as global buttons; the user cannot configure *which* actions are exposed in their fast menu per-chat.

## Design

### `ask` message shape

```ts
// src/chat/service/ask.ts

export type AskActionKind =
  | "open_inventory"      // → routes to actor inventory modal
  | "start_trade"         // → routes to barter/trade modal (initiates trade offer)
  | "enter_battle"        // → opens active battle UI (NO battle-init endpoint exists — B15)
  | "transition_location" // → PUT /api/chats/:id/location (src/routes/chats/extras.ts)
  | "open_modal"          // → plugin-defined GET /api/chat-modals/:kind (NEW)
  | "continue_story";     // → internal: nudge chat pipeline

export interface AskAction {
  /** Stable id for this action within the ask event. */
  id: string;
  /** Kind of action — drives both UI label and dispatch target. */
  kind: AskActionKind;
  /** Display label, computed from kind if omitted. */
  label?: string;
  /** Short description for tooltip / a11y. */
  description?: string;
  /** Icon (font-class or asset id) for the menu button. */
  icon?: string;
  /** Optional payload (e.g. for `open_modal` or `start_trade`, the partner actor id). */
  payload?: Record<string, unknown>;
  /** Optional gating — action hidden if evaluate false. Receives chat + viewer context. */
  availableWhen?: (ctx: AskContext) => boolean;
  /** Confirmation prompt before dispatch (for destructive actions). */
  confirm?: string;
  /** Hotkey, e.g. "i" for inventory. */
  hotkey?: string;
}

export interface AskContext {
  chatId: string;
  viewerUserId: string;
  /** Current location id (null if not RPG / no location). */
  locationId: string | null;
  /** Inventory non-empty count per actor (for `open_inventory`). */
  inventoriesNonEmpty: Record<string, boolean>;
  /** Adjacent locations (for `transition_location`). */
  adjacentLocations: LocationSummary[];
  /** Ongoing trade offers involving viewer. */
  activeTradeOffers: number;
  /** Active battles the viewer is a participant in (post-init, see B15). */
  activeBattlesForViewer: number;
}

export interface AskMessage {
  id: string;
  chat_id: string;
  /** Set to 'ask' for this ticket. */
  content_type: "ask";
  /** Encrypted JSON of AskPayload { source, prompt, actions, closure, userOptedIn, resolved_action_id, resolved_at, expires_at }. */
  content: string;
  created_at: string;
}

/** Persisted AskPayload shape (the JSON stored in `AskMessage.content`). */
export interface AskPayload {
  source: "system" | "gm" | "user" | "extension";
  prompt: string | null;
  actions: AskAction[];
  closure: { kind: "one_shot" } | { kind: "persistent" } | { kind: "ephemeral"; ttlMs: number };
  userOptedIn: boolean;
  resolved_action_id: string | null;
  resolved_at: string | null;
  expires_at: string | null;
}
 ```

### Storage (after B16 fix)

**Two new tables only** (no `ALTER TABLE messages`):

```ts
// src/db/migrations/parts/NNN_chat_ask_support.ts
//
// Table: chat_ask_dispatches (append-only audit log)
//   id                text  PRIMARY KEY
//   message_id        text  FK messages.id ON DELETE CASCADE
//   chat_id           text  FK chats.id   ON DELETE CASCADE
//   viewer_user_id    text  FK users.id  ON DELETE SET NULL
//   action_id         text  — id within actions JSON
//   action_kind       text  AskActionKind
//   outcome           text  — 'dispatched' | 'failed' | 'cancelled' | 'gated'
//   outcome_detail    text  — JSON (nullable)
//   context_snapshot  text  — JSON snapshot of AskContext at dispatch time
//   created_at        text  — datetime('now')
//
// Table: chat_ask_opt_in (per-viewer-per-chat configuration)
//   chat_id           text  FK chats.id  ON DELETE CASCADE
//   user_id           text  FK users.id  ON DELETE CASCADE
//   config_json       text  — AskOptInConfig JSON
//   updated_at        text  — datetime('now')
//   PRIMARY KEY (chat_id, user_id)
```

Schema strategy: **pure additive** — two new tables, no changes to `messages` table. `messages.content_type='ask'` (existing column with `defaultTo('text')` and no CHECK constraint; verified in `src/db/migrations/parts/006_chat.ts:234` + `src/db/schema-manifest.ts:1502`) is the discriminator; `messages.content` carries the encrypted AskPayload JSON.


### Surface-initiated actions (system source)

A new service `src/chat/service/ask/sources.ts` exposes per-source action computors:

```ts
export interface AskSource {
  readonly name: "system" | "gm" | "user" | "extension";
  compute(ctx: AskContext): Promise<AskAction[]> | AskAction[];
}

// Built-in sources:
registerAskSource({
  name: "system",
  compute: (ctx) => {
    const out: AskAction[] = [];
    if (ctx.locationId !== null) {
      out.push({ id: "sys:inventory", kind: "open_inventory", label: "Inventory", icon: "🎒", hotkey: "i", });
    }
    if (ctx.activeTradeOffers > 0) {
      out.push({ id: "sys:trade", kind: "start_trade", label: "Trade", icon: "🤝", hotkey: "t", });
    }
    if (ctx.activeBattlesForViewer > 0) {
      out.push({ id: "sys:battle", kind: "enter_battle", label: "Battle", icon: "⚔️", hotkey: "b", });
    }
    if (ctx.adjacentLocations.length > 0) {
      out.push({
        id: "sys:transition",
        kind: "transition_location",
        label: "Travel",
        icon: "🗺️",
        hotkey: "m",
      },
    });
    return out;
  },
});
```

`availableWhen` gates (e.g., `enter_battle` requires `activeBattlesForViewer > 0`) are applied server-side AND client-side; the server is the source of truth (the client's copy is for UX only).

> Note: `enter_battle` requires battle to already be spawned. The chat pipeline spawns battles (see `epic-battle-action-systems.md` Phase 0 for the unanswered initiation question). The ask menu only opens the existing battle UI — it does not initiate battles.

### User opt-in lifecycle

`src/chat/service/ask/opt-in.ts`:

```ts
export interface AskOptInConfig {
  /** Per-source enable (system / gm / user). Extension-plugins add their own. */
  sources: { system: boolean; gm: boolean; user: boolean };
  /** Per-kind allow/deny. */
  kinds: Record<AskActionKind, "always" | "ask" | "never">;
  /** Hard cap on number of actions in menu (UI density). */
  maxActions: number;
  /** Set when user last modified (for UI display only). */
  updatedAt: string;
}

// Note: chatId + userId live in the chat_ask_opt_in PK, not in the config_json payload.
```

**Default:** `{ sources: { system: true, gm: true, user: false }, kinds: all "ask", maxActions: 8 }` — opt-in is for user-curated extensions; system- and GM-sourced asks require no opt-in.

A user toggles these in chat settings (HTMX form, `PUT /api/chats/:id/ask-opt-in`) and the change applies to all **future** ask messages — existing unresolved ask messages keep their current action set (immutable from this ticket's design).

### Frontend (`src/frontend/chat/ask-menu.ts`)

New component, sibling to `src/frontend/vn/choice-cards.ts`:

```ts
export function initAskMenu(container: HTMLElement, chatId: string,): void;
export function loadAskMenu(): Promise<void>;     // fetches GET /api/chats/:id/ask-active
export function dispatchAction(actionId: string,): Promise<DispatchResult>;
export function destroyAskMenu(): void;

// Listens for:
//   - htmx:afterRequest on chat send (refresh)
//   - CustomEvent("chat:location-changed") from existing code (already dispatched)
//   - CustomEvent("chat:trade-updated")
//   - CustomEvent("chat:battle-updated")
export function bindAskMenuEvents(container: HTMLElement,): void;
```

**Render rules:**
- Menu pinned above the chat input (between message stream and composer)
- Mobile: vertical button list with labels
- Desktop: horizontal icon strip + label on hover (per `epic-character-portraits-placement.md` "image left/right" precedent for wide chat windows — keep room for portrait columns on `≥1200px`)
- Hotkey focus only when chat composer is empty (avoid stealing keystrokes from typing)
- Accessibility: each button is `role="button"`, keyboard-navigable, has aria-label = description if present
- HTMX `hx-post` for dispatch → server returns updated `messages` partial + new chat_ask_dispatches row

### Backend endpoints

| Verb | Path | Purpose |
| ---- | ---- | ------- |
| `POST` | `/api/chats/:id/ask` | Create an ask message (system-internal; no client route — only services call this) |
| `GET` | `/api/chats/:id/ask-active` | Returns the most recent unresolved `ask` message for the viewer, or 204 if none |
| `POST` | `/api/chats/:id/ask/:messageId/dispatch` | Dispatch an action: writes `chat_ask_dispatches` row, calls the kind-specific handler, updates `messages.ask_resolved_*` |
| `PUT` | `/api/chats/:id/ask-opt-in` | Update viewer opt-in config |
| `GET` | `/api/chats/:id/ask-opt-in` | Read viewer opt-in config |

### Action dispatch handlers (`src/chat/service/ask/dispatch.ts`)

| Kind | Existing Target Endpoint | Notes |
| ---- | ------------------------ | ----- |
| `open_inventory` | `GET /api/actors/:id/inventory` → render inventory modal | Already exists in `epic-inventory.md` and `src/routes/actor-items.ts` |
| `start_trade` | `POST /api/worlds/:worldId/trade/offers` | Already exists in `src/routes/trade/offers.ts`; for opt-in creation, ask payload includes partner actor id |
| `enter_battle` | `POST /api/battles` | Already exists in `src/battle/`; ask payload includes battle kind (skirmish / duel / world-event) |
| `transition_location` | `PUT /api/chats/:id/location` | Already exists in `src/routes/`; ask payload includes `locationId` from adjacent locations |
| `open_modal` | `GET /api/chats/:id/modals/:kind` | **NEW** — extension point for plugins; modal kind is plugin-defined |
| `continue_story` | (internal) trigger next turn via standard chat pipeline | Reuses existing `src/generation/` |

Each dispatch is **transactional**: a dispatch either commits its kind-specific side effect AND marks the ask message resolved, or fails cleanly with the menu remaining unresolved (user can retry). No partial state.

### Lifecycle diagram (ASCII)

```
┌──────────────────┐
│ System computes  │◀─── chat state change (location change, trade offer,
│   available      │     inventory update, battle spawn, GM action)
│   actions        │
└─────────┬────────┘
          │ POST /api/chats/:id/ask
          ▼
┌──────────────────┐
│ Ask message      │ content_type=ask, closure=one_shot|persistent|ephemeral
│ stored in stream │ opt-in policy applied (filter actions)
└─────────┬────────┘
          │ (HTMX partial above chat input)
          ▼
┌──────────────────┐
│ AskMenu render   │ mobile: vertical | desktop: horizontal strip
└─────────┬────────┘
          │ user clicks action
          ▼
┌──────────────────┐        fail           ┌─────────────────┐
│ POST /dispatch   │──────gated/conflict──▶│ ask_closes=false │
│                  │                        │ stays open       │
└─────────┬────────┘                        └─────────────────┘
          │ ok
          ▼
┌──────────────────┐
│ kind-specific    │ e.g. POST /api/worlds/:id/trade/offers
│ handler          │
└─────────┬────────┘
          │
          ▼
┌──────────────────┐
│ message resolved │ ask_resolved_at set, next ask (if any) becomes active
└──────────────────┘
```

### Edge cases + risks (must be addressed by tests)

1. **Concurrent dispatches** — two users dispatch the same persistent ask → second wins, first receives `outcome='cancelled'` audit row. Test: parallel dispatch test.
2. **Action hidden by `availableWhen` after menu load** — server re-evaluates gates on dispatch; client-side gate is for UX only. Test: dispatch returns 409 + reason when gate fails server-side.
3. **`ephemeral` TTL expiry** — menu auto-closes but message stays in turn stream for audit/history. Test: clock advance + DB assertion.
4. **Encrypted chats** — `messages.content` is encrypted; `ask_actions` JSON must be encrypted too OR opt out of encryption for `ask` (decide in implementation; recommend: encrypt `ask_actions` the same way `content` is encrypted, using `key_id`).
5. **OPT-IN closure when source disabled** — if user disables `system` source mid-menu, current menu stays but new `system` ask events stop spawning (don't backfill).
6. **Plugin-registered action kinds** — extension plugins add new `AskActionKind` values via `registerAskKind({ kind, validator, handler, capabilities })` — requires capability gate (otherwise unknown kinds allowed).
7. **Hotkey collision** with chat composer — `/`, `i`, `t`, `b`, `m` are common shortcuts; only fire when composer is empty AND no modal is open AND no `input[type=search]` is focused.
8. **Mobile no-hover** — desktop tooltip must translate to long-press / explicit "?" icon on mobile.

## Files

- `src/chat/service/ask/types.ts` — AskAction, AskContext, AskMessage, AskOptInConfig types
- `src/chat/service/ask/messages.ts` — service: createAskMessage, listAskMessages, resolveAskMessage (write `ask_resolved_*`)
- `src/chat/service/ask/sources.ts` — system / gm / user / extension source computors + registry
- `src/chat/service/ask/opt-in.ts` — service: getOptInConfig, updateOptInConfig
- `src/chat/service/ask/dispatch.ts` — kind → handler dispatch table + capability gate
- `src/chat/service/ask/capabilities.ts` — `registerAskKind({ kind, validator, handler, capabilities })` plugin extension API
- `src/db/migrations/parts/NNN_chat_ask_support.ts` — creates `chat_ask_dispatches` + `chat_ask_opt_in` (no `ALTER TABLE messages`)
- `src/db/migrations/parts/NNN_chat_ask_support.test.ts` — append-only + ON DELETE CASCADE roundtrip
- `src/routes/chats/ask.ts` — `GET .../ask-active`, `POST .../ask/:messageId/dispatch`, `PUT/GET .../ask-opt-in`
- `src/frontend/chat/ask-menu.ts` — component (render + dispatch + hotkey bind)
- `src/frontend/chat/ask-menu.test.ts` — render rules, dispatch, hotkey collision guards
- `src/chat/service/ask/messages.test.ts`, `opt-in.test.ts`, `sources.test.ts`, `dispatch.test.ts`
- `src/chat/service/ask/dispatch-integration.test.ts` — hits real /api/worlds/:id/trade/offers + /api/chats/:id/location routes (e2e contract)

## Sub-tickets (recommended breakdown)

1. **`TASK-chat-ask-types-and-schema.md`** — types, migration parts, AskContext assembly
2. **`TASK-chat-ask-sources-and-opt-in.md`** — system/gm/user computors + opt-in persistence
3. **`TASK-chat-ask-dispatch.md`** — kind→handler table + capability gate + audit
4. **`TASK-chat-ask-menu-frontend.md`** — render, hotkeys, accessibility, mobile/desktop layout
5. **`TASK-chat-ask-extension-api.md`** — plugin API for new AskActionKind values

## Open questions (require user input before implementation)

1. **Storage location** — RESOLVED (B16): `messages.content_type='ask'` + encrypted JSON in `messages.content` (no new columns, no new chat_ask_events table). Reuse existing encryption path.
2. **Encryption policy for `ask_actions`** — RESOLVED (B16): encrypt via existing `messages.content` encryption path. AskPayload lives as encrypted JSON inside `content` — uniform encrypted-chat contract preserved.
3. **`continue_story` semantics** — does this dispatch the existing chat pipeline's next turn, or inject a "user wants to advance" marker that the GM/assistant interprets? Recommendation: **injects marker** — keeps governance in the chat pipeline. User decision required.
4. **`open_modal` plugin contract** — what does the modal payload look like? Server-rendered htmx partial? Client-side rendered fragment? Per spec conventions (htmx is the norm), recommend **server-rendered htmx partial** with `kind`-routed handler. User decision required.
5. **Hotkey policy** — single-key vs modifier-prefixed (`Alt+I`). Recommendation: **single-key, only when composer empty and no other input focused**. User decision required.
6. **Audit log retention** — `chat_ask_dispatches` rows accumulate forever? Recommend **90-day TTL with archive** (aligns with `epic-analytics-observability.md` retention patterns). User decision required.
7. **VN interop** — should `vn_choices` migrate to use the new `ask` system, or stay separate? Recommendation: **stay separate** — `vn_choices` is LLM-generated scene-locked; `ask` is surface-driven chat-level; different lifecycles. Documentation cross-link only.
8. **B15 follow-up: battle initiation** — out of scope of this ticket; spawn separate `TASK-battle-initiation-from-chat.md` (under `epic-battle-action-systems.md`).

## Acceptance Criteria

### Schema

- [ ] One append-only migration part (`NNN_chat_ask_support`) — creates two tables; ZERO `ALTER TABLE messages`
- [ ] `messages.content_type='ask'` discriminator works (column accepts free text per `parts/006_chat.ts:234`)
- [ ] `chat_ask_dispatches` is append-only (no UPDATE/DELETE permissions per DB role)
- [ ] `chat_ask_opt_in` PK is `(chat_id, user_id)` — one config per viewer per chat

### Functional

- [ ] System surfaces inventory / trade / battle / travel actions when their context gates pass
- [ ] User opt-in config persists across chat reloads (per-chat, per-user)
- [ ] User dispatching an action calls the correct existing endpoint and updates the ask message
- [ ] Failed dispatch leaves the menu open and records failure reason in audit
- [ ] Audit row written for **every** dispatch attempt (success / fail / gated / cancelled)
- [ ] Mobile vertical layout + desktop horizontal strip both render correctly
- [ ] Hotkeys work only when composer empty + no other input focused
- [ ] Plugin extension API registers a new kind end-to-end (validator + handler + capability gate)
- [ ] Encrypted chats: `ask_actions` encrypted with same key as `content` (or documented exception)

### Architecture

- [ ] No new global side effects on existing chat pipeline — opt-in only
- [ ] No new modal framework dependencies — reuse existing `chat_modals` if any
- [ ] Capability-gated plugin API prevents unknown kinds from registering
- [ ] All action kinds are explicit (no string-blob dispatch)

### Verification

- [ ] `bun run check` passes
- [ ] `bun test src/db/migrations` (roundtrip)
- [ ] `bun test src/chat/service/ask`
- [ ] `bun test src/frontend/chat/ask-menu.test.ts`
- [ ] E2E: launch app, create chat, trigger location change → ask menu shows "Travel" → dispatch → location changes → menu closes → audit row written

## Dependencies

- Builds on: `src/routes/actor-items.ts` (inventory), `src/routes/trade/offers.ts` (trade), `src/battle/` (battle), `src/routes/chats/location.ts` (transition), `src/frontend/vn/choice-cards.ts` (UI precedent)
- Parallel/sibling work: `epic-emergent-narrative-design.md` (design lens on user vs system initiative)
- Bridges: `epic-game-frontend-scenes.md` (scene → chat propagation precedent; ask is inverse direction), `epic-inventory-ui.md` (inventory modal), `epic-battle-ui.md` (battle modal), `epic-chat-transfer-location.md` (location transition handler)
- Schema strategy: **append-only** migration parts; nullable columns; defaults preserve current behavior
