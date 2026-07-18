# Chat: Message Bubbles

Visual spec for message rendering: bubble styling, layout, avatars, grouping,
markdown, media attachments, detail levels, thinking display, system messages,
variant switching, inline edit.

For action buttons, toolbars, keyboard shortcuts, and interactions, see
[message-actions.md](./message-actions.md).

---

## Implementation Priority Tiers

| Tier             | Scope                                                                                                                                              | Blocks              |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| **P0 (Core)**    | Bubble styling, alignment, colors, max-width, avatars, grouping, markdown, basic actions (Copy/Remove), system messages                            | Minimum viable chat |
| **P1 (Rich)**    | Reply threading, inline edit, variant switcher, thinking block detail-level awareness, media attachments, keyboard shortcuts, auto-scroll behavior | Competitive chat UX |
| **P2 (Delight)** | Emoji reactions, pinned messages, context menu, mobile bottom sheet, "new message below" floating button, inline stats text (Basic mode)           | Polish layer        |

Features in this document are tagged with their tier. Untagged = P0.

---

## Canonical Message Type

This is the authoritative shape. Frontend types, API responses, and DB schema
must align with this.

```typescript
interface Message {
  id: string;
  role: "user" | "assistant" | "character" | "system";
  content: string;
  created_at: string;
  edited_at?: string; // P1 — for "(edited)" indicator
  thinking?: string; // LLM chain-of-thought
  parent_id?: string; // P1 — reply threading
  status?: "complete" | "partial" | "cancelled";
  variantIndex?: number; // which variant (0-based)
  totalVariants?: number; // how many variants exist
  model_id?: string;
  provider?: string;
  token_count_prompt?: number;
  token_count_completion?: number;
  token_count_total?: number;
  generation_time_ms?: number;
  tokens_per_second?: number;
  reactions?: Reaction[]; // P2 — emoji reactions
  is_pinned?: boolean; // P2 — pinned to chat top
  attachments?: MessageAttachment[];
}

interface MessageAttachment {
  assetId: string;
  order: number;
  caption: string;
  label: string;
  url: string;
  thumbUrl?: string;
  filename: string;
  mimeType: string;
  type: "image" | "audio" | "video" | "document" | "archive";
  width: number;
  height: number;
}

interface Reaction {
  emoji: string;
  count: number;
  userReacted: boolean;
  users: string[];
}
```

---

## CSS Variable Reference (Default Theme)

These are the resolved values from `theme-default.css`. Other themes override
these variables. This table exists so spec readers can verify pixel values
without chasing CSS variables.

| Variable                        | Value        | Used for                               |
| ------------------------------- | ------------ | -------------------------------------- |
| `--accent-primary`              | `#f597e8`    | User bubble bg, active states          |
| `--bg-tertiary`                 | `#30333b`    | Character bubble bg                    |
| `--bg-secondary`                | `#21242c`    | Dropdown bg, secondary surfaces        |
| `--bg-quaternary`               | `#3f424a`    | Hover bg on action buttons             |
| `--text-primary`                | `#fffdf5`    | Character bubble text, primary text    |
| `--text-secondary`              | `#cfcfcf`    | Meta text, secondary text              |
| `--text-tertiary`               | `#898e93`    | Stats text, muted text                 |
| `--border-default`              | `#3c3f41`    | Dropdown borders                       |
| `--radius-sm`                   | `6px`        | Flattened bubble corner, button radius |
| `--radius-md`                   | `10px`       | Bubble border radius                   |
| `--radius-full`                 | `9999px`     | Avatar circle                          |
| `--space-1` through `--space-4` | `4px`–`16px` | Spacing tokens                         |
| `--transition-fast`             | `150ms ease` | Hover fades, action reveals            |
| `--z-dropdown`                  | `100`        | Action dropdown z-index                |

---

## Markdown Rendering

All message content is rendered as markdown. LLMs output markdown natively;
users can also type markdown in the input. Rendering uses
[marked](https://marked.js.org/) with GFM enabled (`breaks: true, gfm: true`).

**Supported syntax**:

- `**bold**`, `*italic*`, `~~strikethrough~~`
- `` `inline code` ``, fenced code blocks with language hint
- `[links](url)` — open in new tab
- `> blockquote`
- `- unordered list`, `1. ordered list`
- Tables (`| col | col |`)
- Task lists (`- [ ] item`, `- [x] item`)
- Line breaks preserved as `<br>`

**Not supported**: footnotes (no extension loaded). Raw HTML passes through
unchanged — content trust model is server-authoritative (user and LLM
content only).

---

## Message Bubbles

| Property      | User message                                           | Character / Other / Assistant              |
| ------------- | ------------------------------------------------------ | ------------------------------------------ |
| Alignment     | Right (`flex-end`, `row-reverse`)                      | Left (`flex-start`)                        |
| Background    | `--accent-primary` (#f597e8)                           | `--bg-tertiary` (#30333b)                  |
| Text color    | Black (#000)                                           | `--text-primary` (off-white)               |
| Border radius | 10px (`--radius-md`), bottom-right 6px (`--radius-sm`) | 10px, bottom-left 6px                      |
| Max width     | 75% of chat area, **capped at 650px**                  | 75% of chat area, capped at 650px          |
| Avatar        | Hidden                                                 | 36px circle, left of bubble (see grouping) |

### Avatar Rules

- User messages: never show avatar
- Character/assistant messages: show 36px circle avatar on the **first
  message of a group**
- Subsequent messages in a group: **spacer** (same width as avatar + gap)
  to maintain vertical alignment
- System messages: no avatar

### Message Enter Animation

Messages fade in from below: `opacity: 0 → 1`, `translateY(8px) → 0`,
duration 200ms ease-out.

---

## Message Grouping

Consecutive messages from the same sender within a time threshold are
visually merged.

### Grouping Rules

| Condition                               | Result                                     |
| --------------------------------------- | ------------------------------------------ |
| Same sender, ≤5 min gap, no `parent_id` | **Group**: merge visually                  |
| Different sender                        | **New group**: show avatar, full timestamp |
| Role change (user → assistant, etc.)    | **Always new group**                       |
| Has `parent_id` (reply)                 | **Always new group** (reply starts fresh)  |
| `role === 'system'`                     | **Always standalone** (no grouping)        |

### Grouped Message Display

| Element          | First in group             | Subsequent in group      |
| ---------------- | -------------------------- | ------------------------ |
| Avatar           | Visible (36px circle)      | Spacer (same width)      |
| Timestamp        | Full format (`"12:34 PM"`) | Short format (`"12:34"`) |
| Author name      | Visible                    | Hidden                   |
| Bubble alignment | Inherited from role        | Inherited from role      |

---

## Message List Scroll Management

The message list scrolls with newest at bottom.

- **Infinite scroll upward**: when the user scrolls to the top, older
  messages are fetched and prepended. A "Load earlier messages" indicator
  appears during loading.
- **No virtual DOM** (v1): all loaded messages are DOM nodes. If performance
  degrades with high message counts, implement page-based loading (chunks
  of 100, "Load earlier" link between chunks).
- **Auto-scroll on new message**: only triggers if the user was already at
  the bottom (within 100px). If scrolled up, a "New message below ↓"
  floating button appears instead.
- **Keep position on prepend**: when older messages load above, scroll
  position relative to the currently visible message is preserved.

---

## Message Detail Levels (LLM Stats)

Every message can display generation metadata. The level depends on the
user's **message detail mode** (configurable in settings).

| Mode          | Stats shown                                                    | Appearance                                                                                                         |
| ------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Immersion** | None                                                           | No metadata — pure message content                                                                                 |
| **Basic**     | Generation time, token count                                   | Subtle gray text at bottom of bubble. `--text-tertiary` color, 11px font. Brightens to `--text-secondary` on hover |
| **Detailed**  | Same as Basic + model name, provider, prompt/completion tokens | Collapsible strip. Collapsed: summary line (e.g. `claude-sonnet                                                    | 3.2s | 245t`). Expanded: full breakdown |

Stats are generated server-side when the message is created.

### Detail-Level Effects on Other Features

| Feature        | Immersion                 | Basic                      | Detailed                            |
| -------------- | ------------------------- | -------------------------- | ----------------------------------- |
| Thinking block | Hidden                    | `💭` indicator (clickable) | Collapsible section ("Thinking...") |
| Action buttons | Compact hamburger (hover) | Compact hamburger (hover)  | Full button row (always visible)    |
| Stats          | Hidden                    | `i` hamburger dropdown     | Inline collapsible strip            |

---

## Thinking Process Display

If the LLM exposes a thinking/reasoning process, display depends on detail
level (see table above).

- **Immersion mode**: hidden entirely
- **Basic mode**: small `💭` indicator at top of character bubble. Click
  expands to show thinking text (italic, secondary color, dimmed background)
- **Detailed mode**: collapsible section at top of bubble, labeled
  "Thinking...", default collapsed

Stored as `thinking` field on the message record. If absent, no indicator.

---

## System / Narration Messages

Messages injected to guide story development (not from a user or character):

- Centered, no bubble background
- Italic text, secondary color (`--text-secondary`)
- Prefix: `◆` (unobtrusive marker)
- No avatar, no hover actions, no stats
- Visible to all participants, part of narrative flow

---

## Message Swipe (Variant Switching, Character Messages Only)

- Counter always visible: `"2/4"` (current variant / total)
- Desktop: left/right arrow keys when message row focused, or click counter
- Mobile: horizontal touch gesture on the character message
- Swipe right → cycle to next existing variant (pre-generated)
- Swipe left → request new AI variant (generates on the fly, counter increments)
- Variants stored server-side with group index in message record
- Deleting the last variant of a message deletes the entire message

---

## Inline Edit Mode

- Bubble transforms into textarea pre-filled with message content
- Save / Cancel buttons appear below
- `Ctrl+Enter` = save, `Escape` = cancel
- On save: htmx PATCH to API, bubble re-renders in place
- Edited messages show **"(edited)"** label in the meta line
- Edit available on own messages only (unless GM/master)

---

## Asset Attachments

Messages can attach assets (images, documents, audio, video). Two modes:
**contextual** (attached to a message) or **standalone** (the asset IS
the message).

### Attachment Types

| Type     | Extensions                    | Display                       |
| -------- | ----------------------------- | ----------------------------- |
| Image    | jpg, png, gif, webp, avif     | Inline in bubble (see layout) |
| Document | pdf, txt, md, csv, json, toml | File card below text          |
| Audio    | mp3, wav, ogg, m4a            | Audio player embed            |
| Video    | mp4, webm, mov                | Video player embed            |
| Archive  | zip, tar, gz                  | File card with download link  |

### Image Layout (Book-like Illustration)

| Image aspect ratio      | Layout                                     |
| ----------------------- | ------------------------------------------ |
| Wide (>16:9)            | Spans full bubble width at top, text below |
| Tall (>9:16 portrait)   | Right-floated, text wraps around           |
| Square-ish (4:3 to 3:4) | Left-floated, text wraps around            |
| Multiple images         | Grid layout (2 columns max, square crops)  |
| Standalone (no text)    | Full bubble width, no text wrapping        |

Bubble bounded by chat width (max 650px):

- Images max-height: 400px (wide images scale proportionally)
- Floating images: max 40% of bubble width
- No enforced cap on text + image total height (chat list scrolls, not bubbles)

**Click to expand**: inline image → lightbox overlay (fullscreen, pinch-to-zoom
on mobile).

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
- Click downloads; PDF opens in new tab (browser native viewer)
- No inline preview for documents in v1

### Audio/Video Display

```
┌─────────────────────────────────────────┐
│ "Listen to this recording..."           │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ ▶ ──●────────────── 0:42 / 2:15    │ │
│ │    ambient_forest.mp3     🔊 3.2 MB │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

- Audio: play/pause, progress bar, volume
- Video: play/pause, progress, fullscreen toggle
- Video max-height: 300px (scales proportionally)
- Autoplay: **never** (always requires user interaction)

### Multiple Attachments

| Mix           | Layout                                       |
| ------------- | -------------------------------------------- |
| All images    | Grid (2 columns max)                         |
| All documents | Stacked file cards                           |
| Mixed         | Images inline, documents as file cards below |

- Max attachments: 10 per message (configurable)
- Max total size: 50MB per message (configurable)

---

## Accessibility Requirements

| Requirement         | Standard   | Target                                                          |
| ------------------- | ---------- | --------------------------------------------------------------- |
| Touch targets       | WCAG 2.5.8 | Minimum 44×44px for all interactive elements                    |
| Keyboard navigation | WCAG 2.1.1 | All actions reachable via Tab + Enter                           |
| Focus ring          | WCAG 2.4.7 | Visible focus indicator on all interactive elements             |
| Screen reader       | WCAG 4.1.2 | `aria-label` on all icon-only buttons                           |
| Color contrast      | WCAG 1.4.3 | 4.5:1 minimum for body text, 3:1 for large text                 |
| Alt text            | WCAG 1.1.1 | All images have descriptive alt text or `alt=""` for decorative |

---

## Test Fixtures

These are the acceptance criteria. Each case must render correctly.

| #   | Case                             | Expected                                                                                    |
| --- | -------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | User message                     | Right-aligned, pink bg, black text, bottom-right corner flat, max-width 75% capped at 650px |
| 2   | Character message                | Left-aligned, dark bg, light text, bottom-left corner flat, 36px avatar on left             |
| 3   | Grouped messages (3 consecutive) | Only first has avatar, only last has full timestamp, others have short time + spacer        |
| 4   | System message                   | Centered, italic, `◆` marker, no bubble, no avatar, no actions                              |
| 5   | Long message (500+ words)        | Text wraps, max-width enforced, no horizontal scroll                                        |
| 6   | Message with wide image          | Image spans full bubble width at top, text below                                            |
| 7   | Message with tall image          | Image floated right, text wraps around left side                                            |
| 8   | Message with 2 images            | Grid layout, 2 columns, square crops                                                        |
| 9   | Partial/cancelled message        | Continue button visible below content                                                       |
| 10  | Message with thinking            | Immersion: hidden. Basic: `💭` icon. Detailed: collapsible section                          |
| 11  | Variant switcher                 | `◀ 2/4 ▶` visible on assistant message with 4 variants                                      |
| 12  | Edited message                   | "(edited)" label in meta line after `edited_at` is set                                      |
| 13  | Mobile viewport (<768px)         | All touch targets ≥44px, no hover-dependent features                                        |
| 14  | Message entrance                 | Fade-in from below, 200ms ease-out                                                          |
| 15  | Scroll position on prepend       | After loading older messages, visible messages don't jump                                   |
