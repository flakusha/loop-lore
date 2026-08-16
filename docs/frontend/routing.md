<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Frontend: URL Structure & Navigation

## URL Scheme

```
/                          → Chat page (most recent chat, or empty state)
/character/:slug           → Chat list for that character
/character/:slug/:chatId   → Specific chat with that character
/character/:slug/new       → Quick-start new chat (uses default greeting)
/character/:slug/create    → Detailed new chat dialog (world selection)

/characters                → Browse all characters
/characters/new            → Create new character
/characters/:slug/edit     → Edit character

/gallery                   → Asset gallery (all media, filterable)

/settings                  → User preferences
/settings/general          → General UI prefs
/settings/chat             → Chat behavior
/settings/api              → LLM provider config
/settings/data             → Import/export, danger zone

/login                     → Authentication (served at /views/login; multi-user mode only)
/register                  → Registration (served at /views/register; if registrationOpen)

/worlds                    → Browse worlds (first-class entity)
/worlds/:id                → World detail / lore / chat rooms
/worlds/:id/edit           → Edit world
```

## Navigation Patterns

**Primary entry point**: `/` always shows the chat interface. If the user has no chats, it shows an empty state with a link to the character browser.

**Character → Chat flow**: user clicks a character → `/character/:slug` shows a list of all chats with that character → user clicks one to enter `/character/:slug/:chatId`.

**Sidebar navigation**: the sidebar persists across all pages. It always shows:

- "loop-lore" brand link → `/`
- Recent chats list (flat list, across all characters)
- Links to `/characters`, `/gallery`, `/settings`
- User menu at bottom

**Page-switching behavior**: htmx swaps the main content area only. The sidebar is NOT reloaded on page navigation — it's part of the layout shell.

## Chat URL Details

```
/character/odysseus              → List: all chats with Odysseus
/character/odysseus/abc123       → Chat with Odysseus (id=abc123)
/character/odysseus/new          → Quick-create: uses character default greeting, redirects to /character/odysseus/:newChatId
/character/odysseus/create       → Full creation: world selector, scenario setup
```

The sidebar chat items link to `/character/:slug/:chatId` directly. The header title area shows the character name and is clickable, linking to `/character/:slug` (the chat list view).

## htmx Navigation

All internal navigation uses htmx `hx-get` with `hx-target="#app-root"` and `hx-swap="innerHTML"`. The browser history is updated via `hx-push-url="true"` on these links, so back/forward works.

Full page reloads only happen on `/login` or hard errors (server 500, connection lost).

## Server-Rendered View Layer

The clean URLs above are the design contract. The current implementation serves
pages from a `/views/:name` route (e.g. `/views/chat`, `/views/login`,
`/views/register`, `/views/characters`). A few bare aliases redirect based on
auth state:

- `GET /` → `/views/chat` if authenticated, else `/views/login`
- `GET /chat` → `/views/chat` if authenticated, else `/views/login`
- `GET /register` → `/views/chat` if authenticated, else `/views/register`

On a `401` from any htmx request, the client redirects to
`/views/login?redirect=<original-path>`. Auth handlers (login, demo-login,
register) return `HX-Redirect: /views/chat` on success. Solo/demo mode has no
login step — `/` lands directly on `/views/chat`.

## Summary

| Concept           | URL                        | Action                               |
| ----------------- | -------------------------- | ------------------------------------ |
| Root chat         | `/`                        | Load most recent chat or empty state |
| Character chats   | `/character/:slug`         | List all chats for that character    |
| Specific chat     | `/character/:slug/:chatId` | Open chat                            |
| Quick new chat    | `/character/:slug/new`     | Create + redirect                    |
| Detailed new chat | `/character/:slug/create`  | Form with world/scenario             |
| Characters        | `/characters`              | Browse grid                          |
| Gallery           | `/gallery`                 | Asset grid                           |
| Settings          | `/settings`                | Preferences                          |
| Worlds            | `/worlds`                  | Browse worlds                        |
| World detail      | `/worlds/:id`              | World lore + related chat rooms      |
