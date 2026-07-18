# Chat: Message Actions

Action buttons, toolbars, keyboard shortcuts, interactions, threading,
reactions, and pinned messages.

For visual bubble styling, layout, avatars, grouping, media, and detail
levels, see [message-bubbles.md](./message-bubbles.md).

---

## Implementation Priority Tiers

| Tier             | Scope                                                                                                             | Blocks              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------- |
| **P0 (Core)**    | Copy, Remove, basic hover reveal                                                                                  | Minimum viable chat |
| **P1 (Rich)**    | Edit, Reply, Regenerate/Retry, Continue, Variant switcher, Keyboard shortcuts, Inline edit                        | Competitive chat UX |
| **P2 (Delight)** | Pin, React, Forward, Summarize, Generate image, Narrate, Analyze, Attach asset, Context menu, Mobile bottom sheet | Polish layer        |

Features in this document are tagged with their tier. Untagged = P0.

---

## Desktop Hover Toolbar

Hovering over a message reveals action buttons. The toolbar appears
**at the bottom of the bubble** (below content and meta), fading in
over 150ms ease.

### Action Layout Modes

The toolbar has two display modes based on the user's **detail level**:

#### Compact Mode (Immersion + Basic)

Actions appear as **hamburger menus** (⋮) that reveal on hover:

```
┌─────────────────────────────────────────┐
│ Hi there!                               │
│                              ┌────────┐ │
│                              │Actions │ │  ← appears on hover
│                              │   ⋮    │ │
│                              └────────┘ │
└─────────────────────────────────────────┘
```

- Primary hamburger (⋮): opens dropdown with all actions
- Info hamburger (i): **Basic mode only** — opens stats dropdown
  (generation time, tokens, speed, model)
- Both hidden by default, fade in on `.message:hover` or `.message:focus-within`

**Dropdown positioning**: appears above the hamburger button, aligned to
the right edge. Closes on outside click.

```
┌────────────────────┐
│ 📋 Copy            │
│ ✏️ Edit            │
│ ♻ Regenerate       │
│ ◀ Prev Variant     │
│ ▶ Next Variant     │
│ ↳ Continue         │  ← only for partial/cancelled
│ 🎭 Impersonate     │  ← only for assistant
│ 🖼 Generate Image  │
│ 💬 Caption         │  ← only when attachments present
│ 🗑 Remove          │  ← red, danger style
└────────────────────┘
```

#### Detailed Mode

Actions appear as a **flat button row** always visible below the content:

```
┌─────────────────────────────────────────┐
│ Hi there!                               │
│                                         │
│ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐   │
│ │📋│ │✏️│ │♻ │ │🎭│ │🖼│ │💬│ │🗑│   │
│ └──┘ └──┘ └──┘ └──┘ └──┘ └──┘ └──┘   │
└─────────────────────────────────────────┘
```

- Stats line below buttons: `claude-sonnet | 3.2s | 245t` (collapsible)
- Variant switcher inline: `◀ 2/4 ▶`

---

## Basic Action Set (P0, always available)

| Action | Icon | Available on | Behavior                                                            |
| ------ | ---- | ------------ | ------------------------------------------------------------------- |
| Copy   | 📋   | All messages | Copies text to clipboard. Toast: "Copied"                           |
| Remove | 🗑    | All messages | Archives message + descendants (see archiving.md). Red/danger style |

## Extended Action Set

### P1 Actions

| Action      | Icon | Available on               | Behavior                                             |
| ----------- | ---- | -------------------------- | ---------------------------------------------------- |
| Edit        | ✏️   | Own messages               | Inline textarea edit (see Inline Edit below)         |
| Regenerate  | ♻    | Assistant messages         | Full regenerate. Variant-aware (creates new variant) |
| Continue    | ↳    | Partial/cancelled messages | Appends new content where message left off           |
| Impersonate | 🎭   | Assistant messages         | Toggle: play as this character (sends as character)  |

### P2 Actions

| Action         | Icon | Available on            | Behavior                                         |
| -------------- | ---- | ----------------------- | ------------------------------------------------ |
| Reply          | ↩    | All messages            | Opens reply composer (see Reply Threading below) |
| Pin            | 📌   | All messages            | Pins message to chat top (GM/master only)        |
| React          | 😊   | All messages            | Emoji reaction picker                            |
| Forward        | ➡    | All messages            | Forward to another chat or export                |
| Summarize      | 📝   | Character messages      | LLM-generated summary of the message             |
| Generate image | 🖼    | Character messages      | Triggers image generation from message text      |
| Narrate        | 📖   | Character messages      | Re-generates as descriptive narration            |
| Analyze        | 🔍   | Image-attached messages | Vision model describes attached images           |
| Attach asset   | 📎   | All messages            | Attach existing asset from gallery               |

---

## Action Visibility by Role

| Action         | user     | assistant    | character     | system |
| -------------- | -------- | ------------ | ------------- | ------ |
| Copy           | ✅       | ✅           | ✅            | ❌     |
| Edit           | ✅ (own) | ✅ (own)     | ✅ (own)      | ❌     |
| Remove         | ✅       | ✅           | ✅            | ❌     |
| Regenerate     | ❌       | ✅           | ✅            | ❌     |
| Continue       | ❌       | ✅ (partial) | ✅ (partial)  | ❌     |
| Impersonate    | ❌       | ✅           | ❌            | ❌     |
| Reply          | ✅       | ✅           | ✅            | ❌     |
| Pin            | ✅       | ✅           | ✅            | ❌     |
| React          | ✅       | ✅           | ✅            | ❌     |
| Forward        | ✅       | ✅           | ✅            | ❌     |
| Summarize      | ❌       | ✅           | ✅            | ❌     |
| Generate image | ❌       | ✅           | ✅            | ❌     |
| Narrate        | ❌       | ❌           | ✅            | ❌     |
| Analyze        | ❌       | ❌           | ✅ (w/ image) | ❌     |
| Attach asset   | ✅       | ✅           | ✅            | ❌     |

System messages have **no actions** (no toolbar, no context menu).

---

## Mobile Touch Toolbar (P2)

On viewports <768px, hover does not work. Instead:

**Long-press** on a message bubble opens a contextual **bottom sheet**:

```
╔═══════════════════════════════╗
║  Message Actions              ║
╠═══════════════════════════════╣
║  📋 Copy                      ║
║  ↩ Reply                      ║
║  📎 Attach asset              ║
║  📌 Pin to top                ║
║  😊 React                     ║
║  ➡ Forward                    ║
║  📝 Summarize                 ║
║  🖼 Generate image            ║
║  📖 Narrate                   ║
║  🔍 Analyze                   ║
║  ✏️ Edit                      ║
║  ─────────────────────────── ║
║  🗑 Remove                    ║  ← red, separated by divider
╚═══════════════════════════════╝
```

- Swipe up on bubble = same as long-press
- Tap elsewhere = dismiss
- Destructive actions (Remove) shown in red, separated by divider
- Touch targets: **minimum 44×44px** (WCAG 2.5.8)

---

## Keyboard Shortcuts (P1)

Active when a message is focused (Tab to focus, visual focus ring shown).

| Shortcut           | Action                 |
| ------------------ | ---------------------- |
| `Ctrl+C` / `Cmd+C` | Copy message text      |
| `Ctrl+R`           | Retry / Regenerate     |
| `Ctrl+E`           | Edit (own messages)    |
| `Delete`           | Remove (with confirm)  |
| `Ctrl+Shift+R`     | Reply                  |
| `Ctrl+P`           | Pin / Unpin            |
| `Ctrl+J`           | Continue (partial msg) |

---

## Continue Button Placement

The Continue button appears in two locations:

1. **Hover toolbar** — for messages that completed but are candidates
   for continuation (truncated, incomplete sentence)
2. **Inline footer** — for cancelled mid-generation placeholders,
   always visible below the partial content, styled as a subtle
   `"↳ Continue"` link

---

## Inline Edit Mode (P1)

Clicking the Edit action (or `Ctrl+E` on focused message):

1. Bubble transforms into a textarea pre-filled with message content
2. Save / Cancel buttons appear below textarea
3. `Ctrl+Enter` = save, `Escape` = cancel
4. On save: htmx PATCH to API, bubble re-renders in place
5. Edited messages show **"(edited)"** label in the meta line
6. Edit available on own messages only (unless GM/master)

---

## Emoji Reactions (P2)

Clicking React opens a compact emoji picker:

```
┌──────────────────────────┐
│ 👍 ❤️ 😂 🎭 ⚔️ 🗡️ 🏰 ✨ │
│ 📌 💀 🐉 🌲 ⚡ 🔥 💧 🌙 │
│                          │
│ Custom: [____________]   │
└──────────────────────────┘
```

**Reaction display**: small emoji badges below the message text, inside
the bubble:

```
┌─────────────────────────────┐
│ The dragon roars.           │
│                             │
│ 👍 2  ❤️ 1  🐉 3           │
└─────────────────────────────┘
```

- Reactions per-message, stored in `message_reactions` table
- Clicking a reaction toggles your reaction
- Hover shows who reacted: "Alice, Bob, Charlie"
- Max 8 unique reactions per message

---

## Reply Threading (P1)

Users can reply to a specific message, creating a visual thread.

### Reply Flow

1. User clicks Reply (↩) on a message
2. Input area shows reply context bar above textarea:

```
┌─────────────────────────────────────────┐
│ ↩ Replying to Character: "The forest    │
│    is dark..."                     [×]  │
├─────────────────────────────────────────┤
│ Type a message...                       │
└─────────────────────────────────────────┘
```

3. × dismisses the reply (cancels, returns to normal input)
4. On send: message created with `parent_id` pointing to replied-to message

### Thread Display

Replied-to messages show a thread indicator:

```
┌─────────────────────────────────────────┐
│ ↩ "The forest is dark..."              │  ← reply preview (collapsed)
│                                         │
│ What lives there?                       │  ← actual reply text
│                                         │
│ 12:34 · User                [📋] [⋮]   │
└─────────────────────────────────────────┘
```

- Reply preview: truncated quoted text (max 60 chars), collapsed
- Clicking preview scrolls to original message + 2s yellow flash highlight
- Mobile: reply preview is a horizontal bar with quote icon

### Thread Depth

- **v1**: flat replies only (reply to any message, no nested threads)
- `parent_id` creates a tree, but UI shows flat timeline
- **Future**: nested thread view (collapsible branches)

System/narration messages: **cannot be replied to**.

---

## Pinned Messages (P2)

GM or chat master can pin important messages to the top of the chat.

### Pinned Bar

```
┌─────────────────────────────────────────┐
│ 📌 Pinned: "The quest begins at dawn."  │  ← pinned message preview
│    Click to scroll to message      [×]  │     (collapsible)
├─────────────────────────────────────────┤
│ [message list...]                       │
└─────────────────────────────────────────┘
```

- Max 3 pinned messages (configurable)
- Collapsible (click header to toggle)
- Clicking pinned preview scrolls to message + highlights it
- × unpins (GM/master only)
- Stored in `chat_pins` table (`chat_id`, `message_id`, `pinned_by`, `pinned_at`)
- Bar shows at top of message list, above oldest loaded message

---

## Message Context Menu (P2)

Right-clicking (desktop) or long-pressing (mobile) opens a context menu
with all available actions:

```
┌──────────────────────────┐
│ 📋 Copy                  │
│ ↩ Reply                 │
│ 📎 Attach asset          │
│ ✏️ Edit                  │
│ 📌 Pin to top            │
│ 😊 React                 │
│ ➡ Forward                │
│ 📝 Summarize             │
│ 🖼 Generate image        │
│ 📖 Narrate               │
│ 🔍 Analyze               │
│ ─────────────────────── │
│ 🗑 Remove                │
└──────────────────────────┘
```

- Same actions as hover toolbar, presented as vertical list
- Destructive actions (Remove) separated by divider, colored red
- On mobile: bottom sheet (slides up from bottom)
- On desktop: appears at cursor position

---

## Test Fixtures

| #   | Case                       | Expected                                          |
| --- | -------------------------- | ------------------------------------------------- |
| 1   | Hover on user message      | Actions fade in at bottom of bubble, 150ms ease   |
| 2   | Hover on character message | Same, with avatar visible                         |
| 3   | Compact mode hamburger     | ⋮ button → dropdown with all available actions    |
| 4   | Detailed mode buttons      | Flat row of icon buttons always visible           |
| 5   | Click Copy                 | Toast "Copied", text on clipboard                 |
| 6   | Click Remove               | Confirmation → message archived, not deleted      |
| 7   | Edit own message           | Textarea appears, pre-filled, Save/Cancel buttons |
| 8   | Ctrl+Enter in edit         | Saves edit, "(edited)" label appears              |
| 9   | Escape in edit             | Cancels edit, reverts to original content         |
| 10  | Continue on partial        | New content appended, Continue button disappears  |
| 11  | Regenerate                 | New variant created, variant counter increments   |
| 12  | Mobile long-press          | Bottom sheet slides up, all actions listed        |
| 13  | Mobile touch target        | All buttons ≥44×44px                              |
| 14  | Keyboard Tab focus         | Focus ring visible on message                     |
| 15  | Ctrl+R on focused message  | Triggers regenerate                               |
