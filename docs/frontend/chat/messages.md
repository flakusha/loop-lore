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

## Asset Positioning (Book-like Illustration Layout)

**Status**: Implemented. Attachments are stored in `attachments` JSON array on each message record, referencing assets via `asset_links` with `entity_type='message'`.

A message can hold attached images (or other media). The display depends on image size and proportion:

| Image aspect ratio      | Layout                                                      |
| ----------------------- | ----------------------------------------------------------- |
| Wide (>16:9)            | Spans full bubble width at top of message, text below       |
| Tall (>9:16 portrait)   | Right-floated, text wraps around (like a book illustration) |
| Square-ish (4:3 to 3:4) | Left-floated, text wraps around                             |
| Multiple images         | Grid layout (2 columns max, square crops)                   |

The bubble is bounded by the chat width (max 650px). Height should be reasonable:

- Images max-height: 400px (wide images scale down proportionally)
- Floating images (left/right): max 40% of bubble width
- Text + image total height: no enforced cap, but scrolling within the bubble is avoided — the chat list scrolls, not individual bubbles

**Document attachments** (PDF, text files): shown as a file card below the message text (icon + filename + size + download link). No inline preview.

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

## Message Tooling (Top Corner Actions)

Hovering over a message reveals a toolbar in the top-right (user messages) or top-left (character messages) corner of the bubble. The toolbar appears as a row of compact icon buttons on fade-in.

**Basic action set** (always available):

- **Copy**: copies message text to clipboard
- **Retry** (character messages only): requests a new AI response (full regenerate for single-step; resume from failed step for multi-step)
- **Continue** (character messages only, shown on partial/cancelled messages): appends new content where the message left off — see [generation.md](./generation.md#continue-generation-cut-off--cancelled-messages)
- **Remove**: deletes the message (cascade archives descendants — see [archiving.md](./archiving.md))

**Extended action set** (available depending on context and mode):

- **Summary**: generate a short summary of this message
- **Image generation**: generate an image from the message text (triggers sd-cpp or API)
- **Narrate**: re-generate the message with narration style — future
- **Analyze**: run vision analysis on attached images — future

**Placement**: actions are in a horizontal row, flush with the top edge of the bubble. Icons are 16x16px or Unicode glyphs.

Example layout:

- Top-right corner of user messages: Copy | Retry | Remove buttons
- Top-left corner of character messages: Copy | Retry | Continue | Remove buttons
- Partial/cancelled messages show a "↳ Continue" footer button outside the hover toolbar (always visible)
- Below the message text: stats line (visible in Basic/Detailed mode)

The user message's toolbar is on the right; character message's toolbar is on the left.

**Continue button placement**: the Continue button appears in two locations:

1. **Hover toolbar** — for messages that completed but are candidates for continuation (truncated, incomplete sentence)
2. **Inline footer** — for cancelled mid-generation placeholders, always visible below the partial content, styled as a subtle "↳ Continue" link

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
