<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Frontend: Characters Page

## Character List (`/characters`)

### Layout

Full-page grid. No sidebar in the traditional sense — the sidebar switches to a filter/search column (240px wide) on the left. The character list area occupies the remaining width.

### Left Column (filter & actions)

- Search input (text field with magnifier icon, filters by name as you type with debounce)
- Sort dropdown: "Newest", "Most Active", "Name A-Z"
- Filter chips row: "All", "Recently Used"
- "Create Character" button (primary style, full width)

### Main Area (responsive grid)

Character cards arranged in a responsive grid. Minimum card width 180px, cards fill available space.

**Each card**:

- Character avatar (3:4 portrait aspect ratio, object-fit cover, rounded top corners)
- Name below image (bold, 14px)
- Short description (two lines, truncated with ellipsis, 12px, secondary text color)
- Hover state: card lifts (translateY -2px), pink border highlight, box-shadow deepens

**Click behavior**: navigating to `/character/:slug` (chat list for that character), not directly to a chat.

### States

| State              | Visual                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------ |
| Zero characters    | Centered: "No characters yet. Create your first character to start chatting." + "Create Character" button    |
| Loading            | Grid of 6 skeleton cards with shimmer animation (rectangular image placeholder + two text line placeholders) |
| Search, no results | "No characters match your search." with "Clear filters" link                                                 |
| Network error      | Inline banner at top: "Failed to load characters. [Retry]"                                                   |

---

## Character Create (`+ New` modal on `/views/characters`)

Create is a modal on the characters page (no `/characters/new` page route).
The **+ New** header button loads `/partials/characters/create-modal` into the
modal container.

### Form Sections

**Section 1: Identity**

- Name (text input, required, max 64 chars)
- Avatar upload (drag-and-drop zone, accepts image/*. Shows preview after selection. Clears to a default silhouette if none selected.)
- Short description (textarea, 2-3 lines, displayed on character cards and chat list)

**Section 2: Persona**

- Personality (textarea, freeform. Describes traits, mannerisms, speech patterns. No length limit enforced by UI, but server-side cap applies.)
- Scenario (textarea, initial scene/setting description. Optional. Used as system context for new chats.)
- Greeting (textarea, the first message the character sends when a new chat starts. Optional. If not set, the chat starts empty.)

**Section 3: Tags** (simple section)

- Tags input (comma-separated text input, converted to removable chips on blur/enter. Max 10 tags.)

### Actions

- "Save" button (primary)
- "Cancel" button (ghost — closes the modal)

### Behavior

- Validation errors appear inline below each field (red text, small, appears on blur or submit)
- On successful save: modal closes, grid refreshes with the new character

## Character Edit (`/characters/:id/edit`)

Single column form, centered, max-width 600px. No sidebar visible — the form replaces the main content area. A back link at the top navigates back to `/characters`.

### States

| State                              | Visual                                                   |
| ---------------------------------- | -------------------------------------------------------- |
| Loading character data (edit mode) | Skeleton form fields (shimmer rectangles for each input) |
| Save in progress                   | Save button shows spinner, inputs disabled               |
| Validation error                   | Red text below the offending field                       |
| Save error                         | Inline banner at top: "Failed to save. [Retry]"          |
| Avatar uploading                   | Drop zone shows progress, file name                      |
