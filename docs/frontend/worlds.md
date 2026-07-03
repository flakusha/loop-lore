# Frontend: Worlds

**URLs**: `/worlds`, `/worlds/:id`, `/worlds/:id/edit`

## Overview (v1 scope)

Worlds are a first-class entity in v1. A world contains setting context (lore, atmosphere, rules) that multiple chat rooms (chats) can reference. Player actions in chat rooms contribute to the evolving story of the world.

In v1, worlds are defined by the user and linked to chats during detailed creation. Collaborative world-building (multiple users contributing to the same world) is a future feature.

## World List (`/worlds`)

### Layout

Same sidebar as chat (showing chat list). The main content area shows a list of worlds as cards (full-width, not a grid).

**Each world card**:

- World name (bold, 16px)
- Short description (one line, truncated)
- Lore summary snippet (one line, italic, secondary text color)
- Chat room count (e.g., "3 chat rooms")
- Last activity timestamp (relative)
- Click → `/worlds/:id`

**Actions header**: "Create World" button (primary), link to gallery (to link existing assets)

### States

Zero worlds: empty state with "No worlds yet. Create a world to build a shared story setting."

## World Detail (`/worlds/:id`)

### Content Sections (scrollable, single column)

**Header**: world name, description, edit button (secondary, top-right)

**Lore section** (textarea, rendered as formatted text):

- Full lore description
- Rules and constraints of the world
- Atmosphere / tone notes

**Linked chat rooms**:

- List of chats that reference this world
- Each item: character name, chat title, last message preview, "Open Chat" link
- If no chats are linked: "No chat rooms in this world yet. [Create one]" → links to character browser

**Linked assets**:

- Small grid of assets tagged to this world (thumbnails, max 6 shown, "View all" link)
- If none: "No assets linked to this world."

**Actions**: Edit (secondary), Delete (danger, with confirmation), "New Chat Room" (primary — navigates to character browser)

## World Create/Edit (`/worlds/:id/edit`)

Single-column form, max-width 600px, centered.

**Fields**:

- Name (text input, required)
- Description (textarea, short summary for the world card)
- Lore (textarea, full setting description. No limit enforced by UI, server-side cap applies.)
- Tags (comma-separated, converted to chips)

**Actions**: Save (primary), Cancel (ghost). On save → redirect to `/worlds/:id`.

## States

All states follow the same patterns as the character page: loading skeletons, error banners, save spinners, validation errors.
