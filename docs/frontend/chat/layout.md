# Chat: Layout

## Display Philosophy

The chat interface is **centered** with a **configurable maximum width** for the message column. Long lines of text are uncomfortable to read — the message area width should default to a comfortable reading width (~720px) and be adjustable in settings.

**Key constraint**: the message column width does NOT shift or resize when panels open, close, or when the chat input expands. The chat area has a fixed inner content zone; panels overlay or push the outer chrome, but the message column itself stays stable.

**No huge gaps**: spacing between elements is compact. The sidebar, header, message list, and input area transition smoothly without wasted vertical or horizontal space.

---

## Zone Layout

| # | Zone                 | Default behavior                                                            | Mobile behavior                                        |
| - | -------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------ |
| 1 | Left panel (sidebar) | Hamburger menu, attaches to browser window left edge or chat area left edge | Always hamburger, full-screen overlay drawer           |
| 2 | Chat area            | Centered, configurable max-width (default ~720px)                           | Full-width, no centering margin                        |
| 3 | Right panel          | Slides in from right, pushes chat area chrome on desktop                    | Full-screen overlay drawer (other panel/chat disabled) |
| 4 | Input area           | Fixed below chat area, same width as chat area                              | Fixed at bottom, full-width                            |

The left and right panels are used for: chat list, character info, story setup, world/location context, and assistant configuration. In group chat mode (future), a chat admin can freeze panels to prevent users from manipulating story setup.

---

## Left Panel (Hamburger Sidebar)

**Not a fixed sidebar** — it's a hamburger-menu drawer that:

- Slides out from the left edge of the browser window (attached to window edge)
- Can alternatively attach to the left edge of the chat area (configurable preference)
- Opens on clicking the hamburger icon (☰) in the top-left of the header
- Closes on: clicking outside, pressing Escape, or clicking a nav link

**Desktop**: overlays the chat area or pushes it (configurable preference). Default: overlays with a semi-transparent backdrop.

**Mobile (<768px)**: always a full-screen overlay drawer, covering the entire viewport. Left panel takes priority over right panel (if both are open, right is dismissed). When the left panel is open on mobile, the right panel and chat area are inaccessible (disabled).

**Panel contents when open**:

- Brand header ("loop-lore") with close button
- "Chats" section:
  - Flat list of recent chats across all characters (most recent first)
  - Each row: character avatar (36px), character name (truncated), last message preview (truncated), unread badge (pink pill, hidden when 0)
  - Click → navigate to `/character/:slug/:chatId` and close panel
- New Chat button: opens a quick-choice between "Quick chat" and "Detailed setup"
- Navigation links: Browse Characters, Asset Gallery, Worlds
- **Story Notes** (GM and editors only): opens the story steering panel — public and dark notes for the current world/location/chat. Hidden from regular players.
- User footer: avatar (28px), display name, role badge, settings gear

---

## Chat Area (Centered)

The chat area is the primary content zone. It is:

- **Horizontally centered** in the viewport (or remaining space after panels)
- **Max-width configurable**: default ~720px, adjustable in settings (480px–960px range)
- **Width invariant**: the chat content area's width does NOT change when the left panel opens/closes, the right panel opens/closes, or the input textarea expands. Only the outer chrome/background adjusts.
- **Messages + input scroll together**: the message list and input area share the same width boundary. The input does not extend beyond the message area.

Implementation approach:

- The chat area has a fixed-width inner container (`max-width: var(--chat-width, 720px); margin: 0 auto;`)
- Panels operate outside this container (absolute/fixed positioning overlaying the chrome)
- On mobile, the centering margin collapses to 0 (full-width chat)

---

## Right Panel

**Desktop behavior**: slides in from the right edge. Pushes the chat area's chrome (background, header bar) narrower, but the message column inside stays at its fixed width. The header bar and empty space around the chat column compress first.

**Mobile behavior**: slides in as a full-screen overlay drawer, similar to the left panel. Clicking outside or pressing Escape closes it. When the right panel is open on mobile, the left panel and chat area are inaccessible (disabled) to prevent interaction conflicts.

**Contents**:

- Character info (avatar, name, description, tags)
- World + location reference (if linked)
- Token count / context usage
- Story setup controls (if not frozen by admin in group chat)
- Assistant configuration (if assistant is enabled)
- Edit Character link

**Panel consistency**: if the panel is open and the user navigates to a different chat, the panel stays open but its content updates.

---

## Responsive Behavior Summary

| Viewport   | Left panel                 | Right panel                                            | Chat width                       |
| ---------- | -------------------------- | ------------------------------------------------------ | -------------------------------- |
| >1200px    | Hamburger, overlays chrome | Slides in, pushes chrome                               | Centered, configurable max-width |
| 768–1200px | Hamburger, overlays chrome | Slides in, pushes chrome (less room)                   | Centered, narrower max-width     |
| <768px     | Full-screen overlay drawer | Full-screen overlay drawer (other panel/chat disabled) | Full-width, no centering         |
| <480px     | Full-screen overlay drawer | Full-screen overlay drawer (other panel/chat disabled) | Full-width, compact spacing      |

---

## Story Notes Panel

Accessible from the hamburger sidebar as **"Story Notes"** — visible only
to the chat master, GM, and world editors. Regular players do not see
this menu item.

### How It Opens

1. User clicks hamburger (☰)
2. Sidebar slides out
3. "Story Notes" link appears below navigation links (only for authorized roles)
4. Click → a panel slides in from the right (same as the character info panel, replaces it or stacks with tab switching)

### Panel Contents

The Story Notes panel has three tabs:

**Tab 1: Public** (default)

- List of all public notes for the current world/location/chat
- Each note: title, type badge, content preview, priority
- "Add Note" button → inline form (type, title, content, scope, priority)
- Edit/delete on each note (click to expand, inline editing)
- Toggle enabled/disabled per note

**Tab 2: Dark** (GM only, hidden from editors)

- List of all dark notes for the current world/location/chat
- Each note: title, type badge, content preview, urgency, revealed status
- "Add Dark Note" button → inline form with extra fields:
  - Reveal trigger (text input)
  - Reveal condition (dropdown: "on event" / "after N sessions" / "manual")
  - Related notes (multi-select of other dark notes)
  - Depends on (select of other dark notes)
  - Urgency (low/medium/high/critical)
- Edit/delete on each note
- "Reveal Now" button on unrevealed notes → promotes to public immediately

**Tab 3: Arc** (GM only)

- Visual timeline of the story arc
- Shows: notes in order, which are revealed, which are pending
- Connected notes shown as a flow graph
- "Plan new beat" button → add a dark note pre-linked to the arc

### Role Access

| Role         | Public tab  | Dark tab | Arc tab | Add/Edit Public | Add/Edit Dark |
| ------------ | ----------- | -------- | ------- | --------------- | ------------- |
| GM           | ✅          | ✅       | ✅      | ✅              | ✅            |
| World Editor | ✅          | ❌       | ❌      | ✅              | ❌            |
| Chat Master  | ✅          | ❌       | ❌      | ✅              | ❌            |
| Player       | ❌ (hidden) | ❌       | ❌      | ❌              | ❌            |

### Panel Behavior

- Panel persists across chat navigation (content updates to match current world)
- Closing the hamburger does NOT close the Story Notes panel (separate panels)
- On mobile: Story Notes opens as full-screen overlay, same as other panels
- Keyboard shortcut: `Ctrl+Shift+N` toggles the panel (GM/editors only)
- Panel state (open/closed, active tab) saved in localStorage

### Integration with Chat

When a public note is added/edited while in a chat:

- The LLM sees the updated guidance on next generation
- No interrupt — the note takes effect silently

When a dark note's reveal is triggered:

- A system message appears in the chat: "The guide's betrayal is revealed..."
- The dark note moves to the public tab
- The LLM incorporates the reveal into its next response

### Prompt Debug View Connection

The Story Notes panel and Prompt Debug View are complementary:

- Story Notes: where you manage what goes into the prompt
- Debug View: where you see the assembled result
- Dark notes appear in the debug view only for GM users, marked as
  `[GM Dark Notes — DO NOT REVEAL TO PLAYERS]`
