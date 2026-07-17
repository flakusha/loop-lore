# Chat: Messages

This file covers: message bubbles, markdown rendering, asset positioning (book-like layout), hover tooling, inline edit, swipe, message detail levels, thinking process display, and grouping.

---

## Markdown Rendering

All message content is rendered as markdown. LLMs output markdown natively; users can also type markdown in the input. Rendering uses [marked](https://marked.js.org/) with GFM enabled (`breaks: true, gfm: true`).

**Supported syntax**:

- `**bold**`, `*italic*`, `~~strikethrough~~`
- `` `inline code` ``, fenced code blocks with language hint
- `[links](url)` — open in new tab
- `> blockquote`
- `- unordered list`, `1. ordered list`
- Tables (`| col | col |`)
- Task lists (`- [ ] item`, `- [x] item`)
- Line breaks preserved as `<br>`

**Not supported**: footnotes (no extension loaded). Raw HTML passes through unchanged — content trust model is server-authoritative (user and LLM content only).

---

## Message Bubbles

| Property      | User message                       | Character / Other / Assistant message                                               |
| ------------- | ---------------------------------- | ----------------------------------------------------------------------------------- |
| Alignment     | Right                              | Left                                                                                |
| Background    | `--accent-primary` (#f597e8)       | `--bg-tertiary` (#30333b)                                                           |
| Text color    | Black                              | `--text-primary` (off-white)                                                        |
| Border radius | 10px, bottom-right 4px             | 10px, bottom-left 4px                                                               |
| Max width     | 75% of chat area (capped at 650px) | 75% of chat area (capped at 650px)                                                  |
| Avatar        | Hidden                             | 36px circle, left of bubble. First of group only. Subsequent messages get a spacer. |

**Message grouping**: consecutive messages from the same sender within a 5-minute threshold merge. On merge:

- Only the last message shows the full timestamp
- Earlier messages show a shortened time ("12:34")
- Avatar appears only on the first message of the group

**Message list scroll management**: the message list scrolls with newest at bottom. To handle long conversations efficiently:

- **Infinite scroll upward**: when the user scrolls to the top of the current message list, htmx fetches older messages and prepends them (lazy loading). A "Load earlier messages" indicator appears at the top during loading.
- **No virtual DOM**: v1 renders all loaded messages as DOM nodes. If a chat contains high message counts and performance degrades, implement page-based loading (load in chunks of 100, "Load earlier" link between chunks).
- **Auto-scroll on new message**: only triggers if the user was already at the bottom (within 100px of the bottom). If the user has scrolled up to read history, a "New message below ↓" floating button appears instead of forcing the scroll position.
- **Keep position on prepend**: when older messages load above the current view, scroll position relative to the currently visible message is preserved (no jump).

---

## Asset Attachments

Messages can attach assets (images, documents, audio, video). Assets
can be attached in two ways: **contextual** (attached to a specific
message) or **standalone** (sent as its own message).

### Attachment Types

| Type     | Extensions                    | Display                       |
| -------- | ----------------------------- | ----------------------------- |
| Image    | jpg, png, gif, webp, avif     | Inline in bubble (see layout) |
| Document | pdf, txt, md, csv, json, toml | File card below text          |
| Audio    | mp3, wav, ogg, m4a            | Audio player embed            |
| Video    | mp4, webm, mov                | Video player embed            |
| Archive  | zip, tar, gz                  | File card with download link  |

### Contextual Attachments (attached to message)

Assets attached to an existing message. The message text provides
context for the asset.

**Use cases:**

- User says "look at this" and attaches an image
- Character describes a document, GM attaches the actual file
- User shares a map image with location description
- Player uploads a character sheet PDF

**How it works:**

### Standalone Attachments (asset as message)

Assets sent without accompanying text. The asset IS the message.

**Use cases:**

- User pastes an image directly (Ctrl+V)
- User drags an image into the chat
- User clicks "Generate image" and the result is the only content
- System injects a generated image (from vision analysis)

**How it works:**

1. User pastes/drags file or triggers generation
2. File uploads to `/api/assets`
3. Message created with empty text and `attachments` array with one entry
4. Bubble renders the asset at full width (no text wrapping)

**Difference from contextual:** standalone messages have no text body.
The bubble is purely the asset display.

### Image Layout (Book-like Illustration)

Images in messages adapt their layout based on aspect ratio:

| Image aspect ratio      | Layout                                                      |
| ----------------------- | ----------------------------------------------------------- |
| Wide (>16:9)            | Spans full bubble width at top of message, text below       |
| Tall (>9:16 portrait)   | Right-floated, text wraps around (like a book illustration) |
| Square-ish (4:3 to 3:4) | Left-floated, text wraps around                             |
| Multiple images         | Grid layout (2 columns max, square crops)                   |
| Standalone (no text)    | Full bubble width, no text wrapping                         |

The bubble is bounded by the chat width (max 650px):

- Images max-height: 400px (wide images scale down proportionally)
- Floating images (left/right): max 40% of bubble width
- Text + image total height: no enforced cap, but scrolling within
  the bubble is avoided — the chat list scrolls, not individual bubbles

**Click to expand:** clicking an inline image opens a lightbox overlay
(full-screen preview with pinch-to-zoom on mobile).

### Document Display

Non-image assets render as file cards:

```
┌─────────────────────────────────────────┐
│ Character says something...             │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ 📄 character_sheet.pdf      2.4 MB  │ │
│ │    PDF document · Click to download │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

- File icon varies by type (📄 PDF, 📝 text, 📊 spreadsheet, etc.)
- Shows filename, size, type
- Click downloads the file
- PDF: opens in new tab (browser native viewer)
- No inline preview for documents in v1

### Audio/Video Display

Media assets embed a player:

```
┌─────────────────────────────────────────┐
│ "Listen to this recording..."           │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ ▶ ──●────────────── 0:42 / 2:15    │ │
│ │    ambient_forest.mp3     🔊 3.2 MB │ │
│ └─────────────────────────────────────┘
└─────────────────────────────────────────┘
```

- Audio: inline player with play/pause, progress bar, volume
- Video: inline player with play/pause, progress, fullscreen toggle
- Max height: 300px for video (scales proportionally)
- Autoplay: never (always requires user interaction)

### Attachment Flow

**From input toolbar:**

1. Drag file over chat area → drop zone overlay appears
2. Drop → upload starts
3. On success: file attached to new message (standalone if no text)
4. On error: toast notification

**From clipboard paste:**

1. Ctrl+V / Cmd+V with image in clipboard
2. Image uploads immediately
3. Creates standalone message with the image
4. If text is in the textarea, image attaches contextually instead

**From gallery (asset picker):**

1. Click 📎 → "Choose from Gallery" option
2. Gallery modal opens (filtered to current world)
3. Select asset → reference inserted in textarea
4. No re-upload needed (asset already exists)

### Message with Multiple Attachments

Messages can have multiple attachments. Layout rules:

- **All images:** grid layout (2 columns max)
- **All documents:** stacked file cards
- **Mixed types:** images rendered inline, documents as file cards below
- **Max attachments:** 10 per message (configurable)
- **Max total size:** 50MB per message (configurable)

```
┌─────────────────────────────────────────┐
│ "Here's what I found:"                  │
│                                         │
│ ┌──────────┐ ┌──────────┐              │
│ │ image1   │ │ image2   │              │
│ │ (thumb)  │ │ (thumb)  │              │
│ └──────────┘ └──────────┘              │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ 📄 notes.txt                  12 KB │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

---

## Message Detail Levels (LLM Stats)

Every message can display generation metadata at the bottom. The level of detail depends on the user's **message detail mode**, configurable in settings:

| Mode      | Stats shown                                                              | Appearance                                                                                                                                             |
| --------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Immersion | None                                                                     | No metadata — pure message content                                                                                                                     |
| Basic     | Generation time (e.g., "3.2s"), token count (e.g., "245 tokens")         | Subtle gray text at bottom of bubble. `--text-tertiary` color, 11px font. Brightens to `--text-secondary` on hover.                                    |
| Detailed  | Same as Basic + model name, provider, context tokens used, prompt tokens | Shown in a collapsible strip at the bottom. Collapsed: shows a summary line (e.g., `claude-sonnet &#124; 3.2s &#124; 245t`). Expanded: full breakdown. |

Stats are generated server-side when the message is created. They are appended to the message record as metadata, not rendered client-side.

---

## Message Tooling (Bubble Buttons)

Every message bubble has action buttons. On **desktop**, they appear on
hover. On **mobile** (touch devices), they appear on long-press or
swipe-up gesture.

### Desktop Hover Toolbar

Hovering over a message reveals a toolbar in the top-right (user
messages) or top-left (character messages) corner of the bubble.
The toolbar fades in (150ms ease).

```
User message (hover):           Character message (hover):
┌─────────────────────┐         ┌─────────────────────────────┐
│ Hello, traveler!  ┌─┤         ├─┐ The forest is dark...      │
│                   │C│         │C│ and full of ancient         │
│                   │R│         │R│ secrets.                    │
│                   │X│         │X│                             │
└─────────────────────┘         └─────────────────────────────┘
  C = Copy, R = Retry,          C = Copy, R = Retry,
  X = Remove                    X = Remove, ▶ = Continue
```

### Basic Action Set (always available)

| Action   | Icon | Available on       | Behavior                                                 |
| -------- | ---- | ------------------ | -------------------------------------------------------- |
| Copy     | 📋   | All messages       | Copies text to clipboard. Toast: "Copied"                |
| Retry    | 🔄   | Character messages | Full regenerate. Prompts confirm if message has children |
| Continue | ▶    | Partial/cancelled  | Appends new content where message left off               |
| Remove   | 🗑️   | All messages       | Archives message + descendants (see archiving.md)        |

### Extended Action Set (context-dependent)

| Action         | Icon | Available on        | Behavior                                    |
| -------------- | ---- | ------------------- | ------------------------------------------- |
| Edit           | ✏️   | Own messages        | Inline textarea edit (see below)            |
| Reply          | ↩️   | All messages        | Opens reply composer (see threading below)  |
| Pin            | 📌   | All messages        | Pins message to chat top (GM/master only)   |
| React          | 😊   | All messages        | Emoji reaction picker                       |
| Forward        | ➡️   | All messages        | Forward to another chat or export           |
| Regenerate     | 🔄️   | Character messages  | Same as Retry but variant-aware (swipe)     |
| Summary        | 📝   | Character messages  | LLM-generated summary of the message        |
| Generate image | 🎨   | Character messages  | Triggers image generation from message text |
| Narrate        | 📖   | Character messages  | Re-generates as descriptive narration       |
| Analyze        | 🔍   | Image-attached msgs | Vision model describes attached images      |
| Attach asset   | 📎   | All messages        | Attach existing asset from gallery          |

### Toolbar Layout

**Desktop (hover):**

```
┌─────────────────────────────────────────┐
│ Hi there!                            ┌──┤
│                                       │📋│ ← Copy
│                                       │↩️ │ ← Reply
│                                       │📎│ ← Attach
│                                       │⋯ │ ← More (dropdown)
│                                       └──┘
└─────────────────────────────────────────┘

More dropdown:
┌────────────────────┐
│ 📌 Pin             │
│ 😊 React           │
│ ➡️ Forward         │
│ 📝 Summarize       │
│ 🎨 Generate image  │
│ 📖 Narrate         │
│ 🔍 Analyze         │
│ ✏️ Edit            │
│ 🗑️ Remove          │
└────────────────────┘
```

**Primary row** (always visible on hover): Copy, Reply, Attach, More(⋯)
**Extended actions** (inside More dropdown): Pin, React, Forward,
Summarize, Generate image, Narrate, Analyze, Edit, Remove

This keeps the hover toolbar compact (4 buttons) while exposing all
actions via the dropdown.

### Mobile Touch Toolbar

On viewports <768px, hover does not work. Instead:

**Long-press** on a message bubble opens a contextual action sheet
(bottom sheet style):

```
╔═══════════════════════════════╗
║  Message Actions              ║
╠═══════════════════════════════╣
║  📋 Copy                      ║
║  ↩️ Reply                     ║
║  📎 Attach asset              ║
║  📌 Pin to top                ║
║  😊 React                     ║
║  ➡️ Forward                   ║
║  📝 Summarize                 ║
║  🎨 Generate image            ║
║  📖 Narrate                   ║
║  🔍 Analyze                   ║
║  ✏️ Edit                      ║
║  ─────────────────────────── ║
║  🗑️ Remove                    ║
╚═══════════════════════════════╝
```

- Swipe up on bubble = same as long-press
- Tap elsewhere = dismiss
- Destructive actions (Remove) shown in red, separated by divider
- Touch targets: minimum 44×44px (WCAG 2.5.8)

### Keyboard Shortcuts (when message focused)

| Shortcut           | Action                 |
| ------------------ | ---------------------- |
| `Ctrl+C` / `Cmd+C` | Copy message text      |
| `Ctrl+R`           | Retry / Regenerate     |
| `Ctrl+E`           | Edit (own messages)    |
| `Delete`           | Remove (with confirm)  |
| `Ctrl+Shift+R`     | Reply                  |
| `Ctrl+P`           | Pin / Unpin            |
| `Ctrl+J`           | Continue (partial msg) |

### Continue Button Placement

The Continue button appears in two locations:

1. **Hover toolbar** — for messages that completed but are candidates
   for continuation (truncated, incomplete sentence)
2. **Inline footer** — for cancelled mid-generation placeholders,
   always visible below the partial content, styled as a subtle
   "↳ Continue" link

### Inline Edit Mode

Clicking the Edit action (or pressing `Ctrl+E` on a focused message):

- Bubble transforms into a textarea pre-filled with message content
- Save / Cancel buttons appear below
- `Ctrl+Enter` = save, `Escape` = cancel
- On save: htmx PATCH to API, bubble re-renders in place
- Edited messages show "(edited)" label in the meta line
- Edit is available on own messages only (unless GM/master)

### Emoji Reactions

Clicking React opens a compact emoji picker:

```
┌──────────────────────────┐
│ 👍 ❤️ 😂 🎭 ⚔️ 🗡️ 🏰 ✨ │
│ 📌 💀 🐉 🌲 ⚡ 🔥 💧 🌙 │
│                          │
│ Custom: [____________]   │
└──────────────────────────┘
```

**Reaction display**: small emoji badges below the message text,
inside the bubble. Multiple reactions from different users stack:

```
┌─────────────────────────────┐
│ The dragon roars.           │
│                             │
│ 👍 2  ❤️ 1  🐉 3           │
└─────────────────────────────┘
```

- Reactions are per-message, stored in `message_reactions` table
- Clicking a reaction toggles your reaction
- Hover shows who reacted: "Alice, Bob, Charlie"
- Max 8 unique reactions per message

---

## Inline Edit Mode

Clicking the edit action (available in extended set, or via the basic set if toggled in settings):

- Bubble transforms into a textarea pre-filled with message content
- Save / Cancel buttons appear below
- Ctrl+Enter = save, Escape = cancel
- On save: htmx PATCH to API, bubble re-renders in place
- Edited messages show "(edited)" label in the meta line

---

## Message Swipe (Character Messages Only)

- Counter always visible: "2/4" (current variant / total)
- Desktop: left/right arrow keys when message row is focused, or click the counter
- Mobile: horizontal touch gesture on the character message
- Swipe right → cycle to next existing variant (pre-generated)
- Swipe left → request a new AI variant (generates on the fly, counter increments)
- Variants stored server-side with group index in message record
- Deleting the last variant of a message deletes the entire message

---

## Reply Threading

Users can reply to a specific message, creating a visual thread.

**Reply indicator:**

When a user clicks Reply (↩️) on a message:

1. Input area shows a reply context bar above the textarea
2. The × dismisses the reply (cancels, returns to normal input)
3. On send: message is created with `parent_id` pointing to the
   replied-to message

Reply context bar layout:

```
┌─────────────────────────────────────────┐
│ ↩️ Replying to Character: "The forest   │
│    is dark..."                     [×]  │
├─────────────────────────────────────────┤
│ Type a message...                       │
└─────────────────────────────────────────┘
```

**Thread display:**

Replied-to messages show a small thread indicator:

```
┌─────────────────────────────────────────┐
│ ↩️ "The forest is dark..."              │  ← reply preview (collapsed)
│                                         │
│ What lives there?                       │  ← actual reply text
│                                         │
│ 12:34 · User                [📋] [⋯]   │
└─────────────────────────────────────────┘
```

- Reply preview: truncated quoted text (max 60 chars), collapsed
- Clicking the preview scrolls to the original message and highlights
  it briefly (2s yellow flash)
- On mobile: reply preview is a horizontal bar with quote icon

**Thread depth:**

- v1: flat replies only (reply to any message, no nested threads)
- The `parent_id` creates a tree, but the UI shows a flat timeline
- Future: nested thread view (collapsible branches)

**System/narration messages:** cannot be replied to (no Reply action
in their toolbar).

---

## Thinking Process Display

If the LLM exposes a thinking/reasoning process (e.g., chain-of-thought before the final answer), it can be displayed:

- **Immersion mode**: hidden entirely
- **Basic mode**: a small "💭" indicator at the top of the character bubble. Clicking expands to show the thinking text in a subdued style (italic, secondary color, dimmed background)
- **Detailed mode**: the thinking process is visible as collapsible section at the top of the bubble, labeled "Thinking..." with expand/collapse. Default: collapsed.

The thinking process is stored as a separate field on the message record (`thinking`). If no thinking data is available, no indicator is shown.

---

## System / Narration Messages

Messages injected to guide story development (not from a user or character) appear as:

- Centered, no bubble background
- Italic text, secondary color
- Prefix: "◆" or similar unobtrusive marker
- No avatar, no hover actions, no stats
- These are visible to all participants and are part of the narrative flow

---

## Pinned Messages

GM or chat master can pin important messages to the top of the chat.

**Pinned bar:**

```
┌─────────────────────────────────────────┐
│ 📌 Pinned: "The quest begins at dawn."  │  ← pinned message preview
│    Click to scroll to message      [×]  │     (collapsible)
├─────────────────────────────────────────┤
│ [message list...]                       │
└─────────────────────────────────────────┘
```

- Max 3 pinned messages (configurable)
- Pinned bar is collapsible (click header to toggle)
- Clicking a pinned preview scrolls to the message and highlights it
- × unpins the message (GM/master only)
- Pinned messages are stored in `chat_pins` table (chat_id, message_id, pinned_by, pinned_at)
- Pinned bar shows at the top of the message list, above the oldest loaded message

---

## Message Context Menu

Right-clicking (desktop) or long-pressing (mobile) on a message opens
a context menu with all available actions:

```
┌──────────────────────────┐
│ 📋 Copy                  │
│ ↩️ Reply                 │
│ 📎 Attach asset          │
│ ✏️ Edit                  │
│ 📌 Pin to top            │
│ 😊 React                 │
│ ➡️ Forward               │
│ 📝 Summarize             │
│ 🎨 Generate image        │
│ 📖 Narrate               │
│ 🔍 Analyze               │
│ ─────────────────────── │
│ 🗑️ Remove                │
└──────────────────────────┘
```

Same actions as the hover toolbar, presented as a vertical list.
Destructive actions (Remove) separated by divider and colored red.

On mobile: the context menu is a bottom sheet (slides up from bottom).
On desktop: the context menu appears at cursor position.
