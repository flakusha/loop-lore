<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Frontend: Shared Components

Toasts, modals, empty states, spinners, and other reusable UI patterns used across all pages.

---

## Toast Notifications

**Position**: fixed, top-right corner, stack upward.

**Structure**: each toast is a horizontal bar with:

- Left icon (varies by type)
- Message text (flex: 1)
- Close button (×)

**Four variants**:

| Type    | Icon       | Left border                 |
| ------- | ---------- | --------------------------- |
| success | ✓ (green)  | 3px solid `--accent-green`  |
| error   | ✗ (red)    | 3px solid `--accent-red`    |
| info    | ℹ (blue)   | 3px solid `--accent-blue`   |
| warning | ⚠ (yellow) | 3px solid `--accent-yellow` |

**Behavior**:

- Appear with slide-in-from-right animation (200ms ease-out)
- Auto-dismiss after 5 seconds with fade-out animation
- Dismissible by clicking the × button
- Multiple toasts stack vertically, newest on top
- Max 5 visible toasts at once (oldest overflows are dropped)
- Tied to Alpine.js reactive data (`toasts` array in the root app component)

**Dispatched via**: custom DOM event `show-toast` with detail `{ type, message, icon? }`.

---

## Confirmation Dialog

**Structure**: overlay modal with:

- Title (e.g., "Delete message?")
- Message body (describes what will happen)
- Cancel button (secondary style) — dismisses dialog
- Confirm button (danger style for destructive actions, primary for non-destructive)

**Keyboard**: Escape dismisses as Cancel. Enter triggers Confirm.

**Behavior**:

- Modal overlay has `@click.self="close"` (click outside = cancel)
- Confirm dispatches the intended action
- Cancel or Escape or × dismisses without action

---

## Loading Spinner

**Inline variant**: 20px circle, 2px border, `--bg-quaternary` track, `--accent-primary` top border. Used inside buttons during loading states.

**Page-section variant**: 32px circle, 3px border, same colors. Centered in the section area. Used for loading states in gallery grid, character grid, settings forms.

**Animation**: `spin` keyframes (0% → 100% rotation), 0.6s linear, infinite.

---

## Skeleton Shimmer

Used for loading placeholders before content arrives.

**Structure**: a rectangular block with:

- Background: `--bg-tertiary` (`#30333b`)
- Overlay gradient: subtle linear gradient sweep from transparent → semi-transparent white → transparent
- Animation: `shimmer` keyframes (translateX from -100% to 100%), 3s infinite

**Variants by component**:

- **Message skeleton**: left-aligned bubble shape (border-radius 10px, width 60%, height 60px) and two right-aligned (width 40%, height 40px)
- **Card skeleton**: rectangle for image (aspect-ratio 3:4) + two narrow rectangles for text lines
- **Asset skeleton**: rectangle for thumbnail (aspect-ratio 4:3) + narrow rectangle for label
- **Form skeleton**: narrow rectangle for label + wider rectangle for input

---

## Empty States

**Structure**: centered flex column with:

- Large icon (48px, opacity 0.4)
- Title (18px, bold, `--text-secondary`)
- Description (14px, `--text-tertiary`, max-width 300px, centered)
- Action button (optional, primary style)

Used in: zero chats, zero messages, zero characters, zero assets, search-no-results.

---

## Inline Banner

**Structure**: full-width horizontal bar with:

- Colored left border (red for error, blue for info, yellow for warning)
- Icon + message text
- Optional action button ("Retry", "Dismiss")

**Position**: at the top of the relevant content section (above the message list, above the character grid). Does NOT replace the content below it — the banner is inserted above.

**Animation**: slides down from above on appearance, 150ms ease.

---

## Tags / Chips

**Structure**: small inline pill with:

- Background: `--bg-tertiary`
- Text: `--text-secondary`, 12px
- Border-radius: 9999px
- Padding: 2px 8px

**Active variant**: used for selected filters or linked-indicator

- Background: rgba(245, 151, 232, 0.15)
- Text: `--accent-primary`

**Removable variant**: chip with × button. Used in tag inputs and entity selection.

## Info Bubbles (Help Tooltips)

**Structure**: a `(?)` help icon placed inline next to a field label. On hover (desktop) or click (touch), a popover appears with contextual help text.

**Trigger icon**:

- Rendered as a small `(?)` or `ⓘ` glyph
- Color: `--info-bubble-icon` (default: `#888`)
- Hover state: `--info-bubble-icon-hover` (default: `--accent-primary`)
- Size: 14px × 14px, vertical-align: middle

**Popover**:

- Background: `--info-bubble-bg` (default: `--bg-popover`)
- Text: `--info-bubble-text` (default: `--text-secondary`)
- Border: 1px solid `--info-bubble-border`
- Shadow: `--info-bubble-shadow`
- Border-radius: `--radius-sm` (6px)
- Arrow: 6px triangle pointing to the trigger
- Max-width: 240px
- Padding: 8px 12px
- Font-size: 13px, line-height: 1.4

**Trigger modes**:

- `hover` — appears on mouseenter, disappears on mouseleave (desktop default)
- `click` — toggles on click (touch/keyboard default)
- `auto` — hover on desktop, click on touch (component default)

**Behavior**:

- Dismisses on Escape, click-away, or mouseleave (hover mode)
- Keyboard accessible: trigger is focusable, Escape dismisses
- ARIA: `aria-describedby` links trigger to popover content
- i18n: text resolved via `t(key)` from message catalog (Layer 1)

**Usage**:

```html
<label>
  Theme
  <info-bubble key="settings.theme.help"></info-bubble>
</label>
```

---

## Frontend Logger

A lightweight browser-compatible logger for debugging Alpine.js components and htmx handlers.

### API

### Log Levels

| Level | Numeric | Console method |
| ----- | ------- | -------------- |
| debug | 0       | console.debug  |
| info  | 1       | console.info   |
| warn  | 2       | console.warn   |
| error | 3       | console.error  |

### Timestamp Format

Uses ISO 8601 format parseable by `new Date()`:

```
2026-07-04T14:30:00.123+02:00
```

- Milliseconds: 3 digits
- Timezone: Offset from UTC (`+02:00`, `-05:00`, `+00:00`)
- TZ Support: Honors `TZ` environment variable; supports IANA timezone names

### Integration

1. **Development:** Logs appear in browser console with timestamp and module
2. **Production:** Can be disabled via `LOG_LEVEL=error` or sent to server via `fetch()`
3. **Async:** Uses `setImmediate`/`requestIdleCallback` for non-blocking writes

### Usage in Alpine.js Components

---

## Drop Zone (for file uploads)

**Structure**:

- 2px dashed border in `--border-default`
- Border-radius: `--radius-md` (10px)
- Padding: 32px 48px (vertical/horizontal)
- Text centered: icon + "Drag & drop files here" + "or click to browse" hint
- Cursor: pointer

**States**:

- Default: dashed gray border, muted colors
- Hover: pink border highlight, subtle background tint
- Drag-over: pink border, stronger background tint
- Has-file: filename shown, "Upload" button appears

---

## Responsive Breakpoints

| Breakpoint | Behavior                                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| >1200px    | Full layout: sidebar + chat + optional right panel                                                                      |
| 768–1200px | Right panel overlays instead of pushing (no width crunch)                                                               |
| <768px     | Sidebar collapses to hamburger menu. Full-width chat.                                                                   |
| <480px     | Sidebar hidden entirely. Accessible via hamburger. Message bubbles are full-width (max-width: 100%). Toolbar compacted. |

Mobile sidebar: a slide-out drawer overlaying the chat area, toggled by a hamburger icon in the header. The right panel becomes a bottom sheet instead of side panel.

---

## Enhanced Text Fields

Text fields for longer content (lore, descriptions, notes, world-building)
support additional capabilities beyond plain textarea. These fields appear
in: world creation, location editing, story notes, character descriptions,
item lore, quest briefs, and dark notes.

### Capabilities

| Feature             | Trigger                          | Available When              |
| ------------------- | -------------------------------- | --------------------------- |
| Syntax highlighting | Auto-detect content type         | Field has `highlight` flag  |
| Grammar check       | Manual toggle or auto-on-blur    | Field has `grammar` flag    |
| LLM improvement     | Toolbar button or inline request | Field has `llm` flag        |
| Token count         | Always visible                   | Field is long-form textarea |
| Preview toggle      | Toolbar button                   | Field supports markdown     |

### Syntax Highlighting

For fields that contain structured content (TOML, JSON, markdown, dice
notation), the editor applies syntax highlighting.

**Supported content types:**

| Content Type  | Detection Method                               | Highlight Style         |
| ------------- | ---------------------------------------------- | ----------------------- |
| Markdown      | Default for all description fields             | Headings, bold, code    |
| TOML          | Detected by `[section]` headers or `key = val` | Sections, keys, strings |
| JSON          | Detected by `{ }` or `[ ]` wrapping            | Keys, values, brackets  |
| Dice notation | Detected by `d4`, `2d6`, `1d8+3` patterns      | Dice, modifiers, sums   |
| HTML          | Detected by `<tag>` patterns                   | Tags, attributes, text  |

**Implementation:**

- Uses CodeMirror 6 or Monaco editor in lightweight mode
- Falls back to plain textarea if highlight library fails to load
- Read-only highlight (user types plain text, output is highlighted)
- No code execution — purely visual

**UI:**

```
┌─────────────────────────────────────────┐
│ Lore Description                    [MD]│
│ ┌─────────────────────────────────────┐ │
│ │ # The Ancient Library               │ │ ← heading highlighted
│ │                                     │ │
│ │ A repository of **forbidden         │ │ ← bold highlighted
│ │ knowledge**. The shelves hold       │ │
│ │ `forbidden texts` and artifacts.    │ │ ← inline code highlighted
│ │                                     │ │
│ │ > "Those who seek the truth         │ │ ← blockquote highlighted
│ │ > must pay in blood."               │ │
│ └─────────────────────────────────────┘ │
│ 142 tokens · 38 words     [Grammar] [AI]│
└─────────────────────────────────────────┘
```

The `[MD]` badge in the header shows the detected content type. Clicking
it opens a dropdown to switch highlighting mode.

### Grammar Check

A grammar checker runs on the field content. Can be triggered manually
or configured to run automatically on blur.

**How it works:**

```
┌─────────────────────────────────────────┐
│ Location Description            [MD] [G]│
│ ┌─────────────────────────────────────┐ │
│ │ A crumbling temple deep in the      │ │
│ │ swamp, overgrowed with vines.       │ │
│ │                        ~~~~~~~~~~~~ │ │ ← red underline
│ └─────────────────────────────────────┘ │
│ ┌──────────────────────────────────┐    │
│ │ 💡 "overgrowed" → "overgrown"    │    │ ← suggestion tooltip
│ │    Accept · Dismiss              │    │
│ └──────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

**Behavior:**

- `[G]` badge toggles grammar check on/off for this field
- Errors shown as red/yellow squiggly underlines (browser native)
- Auto-run on blur (when user leaves the field) if enabled
- Manual run via `[G]` button click
- Grammar errors counted in status bar: "2 issues found"
- Can be disabled per-field or globally in settings

**Grammar check scope:**

| Check Type  | What It Catches                      |
| ----------- | ------------------------------------ |
| Spelling    | Typos, misspellings                  |
| Grammar     | Subject-verb agreement, tense issues |
| Style       | Passive voice, wordiness, redundancy |
| Punctuation | Missing periods, comma splices       |
| Consistency | Mixed American/British spelling      |

**Note:** Grammar check is best-effort. Technical terms, proper nouns,
and fantasy words are expected to "fail" — users can dismiss suggestions.

### LLM Improvement

The most powerful feature: request the LLM to improve, expand, rewrite,
or transform the field content. Triggered by a toolbar button or inline
request syntax.

#### Toolbar Button

Click the `[AI]` button in the field toolbar. Opens a dropdown:

```
┌──────────────────────────┐
│ AI Actions               │
│                          │
│ ✏️  Improve writing       │
│ 📏  Make more concise     │
│ 📖  Expand description    │
│ 🎭  Add atmosphere/tone   │
│ 📋  Add positive effects  │
│ ⚠️  Add negative effects  │
│ 🔄  Rewrite completely    │
│                          │
│ Custom: [______________] │
│           [Request]      │
└──────────────────────────┘
```

#### Inline Request Syntax

Users can type a request directly in the field using a special prefix:

```
[toml-request-llm] Please expand the description of this location
and its positive and negative effects on characters.
```

The `[toml-request-llm]` prefix (or `[request-llm]`, `[ai-request]`) tells
the engine to:

1. Extract the request text
2. Send current field content + request to the LLM
3. Replace the field content with the LLM response
4. Preserve the original in history (undo available)

**Request syntax variants:**

| Syntax                        | Meaning                      |
| ----------------------------- | ---------------------------- |
| `[request-llm] <prompt>`      | Basic LLM request            |
| `[toml-request-llm] <prompt>` | Request with TOML context    |
| `[ai-request] <prompt>`       | Alias for request-llm        |
| `[expand]`                    | Shorthand for "expand this"  |
| `[rewrite]`                   | Shorthand for "rewrite this" |
| `[concise]`                   | Shorthand for "make concise" |

#### LLM Request Flow

```
1. User triggers LLM improvement (button or inline syntax)
2. Engine extracts:
   - Current field content
   - The user's request (from dropdown selection or inline text)
   - Field context (entity type, field name, current world theme)
3. Engine constructs LLM prompt:

   "You are improving a {field_name} for a {entity_type} in a
    {world_theme} world.

    Current content:
    ---
    {current_content}
    ---

    User request: {request}

    Rewrite the content following the request. Keep the same tone
    and style. Do not add information not supported by the request.
    Output ONLY the improved text, no explanation."

4. LLM generates improved content
5. Engine replaces field content
6. Original content saved to undo history
7. UI shows: "Updated by AI · [Undo]"
```

#### LLM Improvement UI

```
┌─────────────────────────────────────────┐
│ Location Description        [MD] [G] [AI]│
│ ┌─────────────────────────────────────┐ │
│ │ A crumbling temple deep in the      │ │
│ │ swamp, overgrown with vines.        │ │
│ │ Faintly glowing runes on walls.     │ │
│ └─────────────────────────────────────┘ │
│ 89 tokens · 24 words   [Grammar] [AI ▼] │
│                                         │
│ ┌─ AI Generated ─────────────────────┐  │
│ │ ✨ Updated by AI · [Undo]          │  │
│ │                                     │  │
│ │ A crumbling temple half-submerged  │  │
│ │ in murky swamp water. Thick vines  │  │
│ │ choke the broken columns, their    │  │
│ │ tendrils reaching like grasping    │  │
│ │ hands. Faintly glowing runes pulse │  │
│ │ on the interior walls, casting     │  │
│ │ sickly green light across the      │  │
│ │ flooded nave. The air tastes of    │  │
│ │ rot and old magic.                 │  │
│ └────────────────────────────────────┘  │
│                                         │
│ 142 tokens · 38 words                   │
└─────────────────────────────────────────┘
```

#### Context-Aware LLM Requests

The LLM receives context about what it's improving:

| Field Context   | Extra Context Injected                          |
| --------------- | ----------------------------------------------- |
| Location desc   | Connected locations, danger level, world theme  |
| NPC description | NPC stats, role, current disposition            |
| Item lore       | Item rarity, category, stats, effects           |
| Dark note       | Note type, related notes, urgency               |
| Public note     | Note type, scope, priority                      |
| Quest brief     | Quest objectives, rewards, active quests        |
| World lore      | Other lore entries, world genre, existing facts |

This ensures the LLM generates contextually appropriate content that
fits the existing world and entities.

#### LLM Request Limits

To control costs:

| Limit                     | Default     | Configurable |
| ------------------------- | ----------- | ------------ |
| Max requests per field    | 5/min       | Yes          |
| Max content length sent   | 2000 tokens | Yes          |
| Max response length       | 1000 tokens | Yes          |
| Cooldown between requests | 10s         | Yes          |

When rate limited, the `[AI]` button shows a countdown:
"AI available in 8s"

#### Undo History (Frontend Only)

Every LLM improvement saves the previous version **on the frontend**.
Original text is stored in localStorage or Alpine.js reactive state —
never sent to the server. This keeps the undo history fast, private, and
available without network calls.

```
Undo stack (per field, frontend localStorage):
  v3: "A crumbling temple half-submerged..." (current, AI-improved)
  v2: "A crumbling temple deep in the swamp, overgrown..." (original)
  v1: "" (empty, initial)

[Undo] restores v2. [Redo] restores v3.
Max history: 10 versions per field.
```

**Storage key:** `field-undo-{entity_id}-{field_name}`

**Lifecycle:**

- Created when user opens a field for editing
- Pushed to stack on each LLM improvement
- Cleared when entity is deleted
- Persists across page reloads (localStorage)
- Syncs across tabs via `storage` event listener

**Why frontend only:**

- Server never sees pre-LLM text — keeps drafts private
- Undo is instant (no round-trip)
- No DB migration needed for undo history
- LLM responses may contain sensitive story content — keeping originals
  local means they're not stored in any server log or backup

#### Undo/Redo Controls (Shortcuts + Physical Buttons)

Both keyboard shortcuts and physical on-screen buttons are provided so
undo/redo works on desktop, tablet, and phone.

**Keyboard shortcuts:**

| Action | Shortcut                   |
| ------ | -------------------------- |
| Undo   | `Ctrl+Z` (Win/Linux)       |
| Redo   | `Ctrl+Shift+Z` (Win/Linux) |
| Redo   | `Ctrl+Y` (alternative)     |
| Undo   | `Cmd+Z` (macOS)            |
| Redo   | `Cmd+Shift+Z` (macOS)      |

Shortcuts are captured at the field level via `keydown` listener.
They do NOT conflict with browser undo (the browser operates on the
`<textarea>` value; our undo operates on the LLM-improvement history).

**Physical buttons (on-screen UI):**

Two always-visible buttons appear in the field status bar when there is
undo/redo history available:

```
┌─────────────────────────────────────────┐
│ Location Description           [MD] [AI]│
│ ┌─────────────────────────────────────┐ │
│ │ A crumbling temple half-submerged  │ │
│ │ in murky swamp water...            │ │
│ └─────────────────────────────────────┘ │
│ 142 tokens  [Undo] [Redo]  [Grammar]   │
└─────────────────────────────────────────┘
```

**Button behavior:**

- `[Undo]` — restores previous version, grays out when at v1
- `[Redo]` — restores next version, grays out when at latest
- Buttons appear only when the stack has 2+ versions
- Buttons are 32×32px minimum touch target (WCAG 2.5.8 compliant)
- Active state: `--accent-primary` border + background tint
- Disabled state: `--text-tertiary`, `cursor: not-allowed`

**Mobile-specific considerations:**

- On viewports <768px, the undo/redo buttons move to a **floating
  toolbar** anchored above the keyboard (when visible) or at the
  bottom of the screen
- Long-press on the field opens a **context menu** with Undo/Redo
  options (for devices without physical keyboard)
- Swipe gesture: swipe left on the field = redo, swipe right = undo
  (configurable in settings)
- Haptic feedback on undo/redo action (via `navigator.vibrate(10)`)

**Button layout (mobile):**

```
┌─────────────────────────────────────────┐
│ Location Description           [MD] [AI]│
│ ┌─────────────────────────────────────┐ │
│ │ A crumbling temple half-submerged  │ │
│ │ in murky swamp water...            │ │
│ └─────────────────────────────────────┘ │
│ 142 tokens            [Undo] [Redo]     │
│ └─────────────────────────────────────┘ │
│ ╔═════════════════════════════════════╗ │
│ ║  Floating toolbar (above keyboard) ║ │
│ ║  [Undo]  [Redo]  [Grammar]  [AI]  ║ │
│ ╚═════════════════════════════════════╝ │
└─────────────────────────────────────────┘
```

**Accessibility:**

- Both buttons have `aria-label="Undo"` / `aria-label="Redo"`
- Keyboard focusable via Tab
- Screen reader announces: "Undo, version 2 of 3"
- `aria-disabled="true"` when stack is exhausted

### Token Counter

All long-form text fields show a token count in the status bar:

```
142 tokens · 38 words · ~190 chars
```

**Purpose:** helps users manage prompt budget. Fields have soft and hard
limits:

| Limit    | Default     | Behavior                          |
| -------- | ----------- | --------------------------------- |
| Soft     | 500 tokens  | Warning badge (yellow)            |
| Hard     | 2000 tokens | Prevents saving (red badge)       |
| Override | 5000 tokens | GM/editor can exceed with confirm |

### Preview Toggle

For markdown-enabled fields, a `[Preview]` button switches between
edit mode and rendered preview:

```
Edit mode:              Preview mode:
┌──────────────────┐    ┌──────────────────┐
│ # The Library    │    │ The Library      │
│                  │    │                  │
│ A **dark** place │ →  │ A dark place     │
│ with `forbidden` │    │ with `forbidden` │
│ texts.           │    │ texts.           │
└──────────────────┘    └──────────────────┘
```

Preview renders markdown client-side (no server call). Toggle is instant.

### Field Configuration

Each enhanced text field can be configured with flags:

**Default configs by field type:**

| Field                | Highlight | Grammar | LLM | Preview | Limits    |
| -------------------- | --------- | ------- | --- | ------- | --------- |
| World lore           | markdown  | yes     | yes | yes     | 2000/5000 |
| Location description | markdown  | yes     | yes | yes     | 1000/3000 |
| NPC description      | markdown  | yes     | yes | yes     | 500/2000  |
| Item lore            | markdown  | yes     | yes | yes     | 500/1500  |
| Dark note content    | markdown  | yes     | yes | yes     | 1000/3000 |
| Public note content  | markdown  | yes     | yes | yes     | 500/2000  |
| Quest description    | markdown  | yes     | yes | yes     | 1000/3000 |
| Chat rules config    | toml      | no      | no  | no      | 2000/5000 |
| Dice notation        | dice      | no      | no  | no      | 100/500   |
