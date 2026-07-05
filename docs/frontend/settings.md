# Frontend: Settings Page

**URL**: `/settings`

## Overview

User preferences and application configuration. Left sidebar shows section navigation as links. Main area shows the selected section's form.

Sections listed in the sidebar: General, Chat, API, Data, About.

## Sections

### General

- Display name (text input, updates user's display name across the app)
- Theme preset (select: "Default (Dark)", "Light", "Bright", "Colorful", "Monochrome", "No Icons", "Dracula", "Nord", "GitHub Dark", "Material". Default: "Default (Dark)")
  - Theme preference stored in localStorage, persists across sessions
  - Theme change takes effect immediately via CSS sheet switching
- Theme customization (expandable section, collapsed by default):
  - Chat bubble colors: user bubble background, AI bubble background, bubble border (color pickers)
  - Sidebar: background color, brand logo color (color pickers)
  - Input area: background, border, send button background, send button hover (color pickers)
  - Code blocks: background, text color (color pickers)
  - "Reset to defaults" button at the bottom
- Font family (select: "System UI (sans-serif)", "Monospace", "Serif", "OpenDyslexic". Default: "System UI")
- Font size (range slider: 13px–18px, default 15px. Preview text updates live.)
- UI density (select: "Compact" / "Comfortable" / "Spacious". Default: "Comfortable")
  - Compact: tighter spacing, smaller avatars, narrower bubbles
  - Comfortable: balanced spacing (default)
  - Spacious: generous padding, larger avatars, wider gaps
- Language UI | See [internationalization.md](./internationalization.md) for the full spec.
  - v1: catalog infrastructure is in place (key-based `t()` function, `en.json` source, session locale), but only English ships.
    The settings field for interface language appears as a read-only "English" select with a note: "More languages in Future."
  - Future: Language becomes a functional select with locale options, generation language preferences, and content translation settings.

### Chat

- Enter to send (toggle, default: on. When off, Ctrl+Enter sends and Enter inserts newline.)
- Show character counter (toggle, default: off)
- Swipe enabled (toggle, default: on)
- Auto-scroll to bottom on new messages (toggle, default: on)
- Inline image preview (toggle, default: on)
- Generation error feedback (select: "Immersion" / "Balanced" / "Nerd", default: "Balanced")
  - Controls how LLM/image/vision generation failures are surfaced in the chat
  - See [chat/generation.md](./chat/generation.md) for per-mode details
- Message detail level (select: "Immersion" / "Basic" / "Detailed", default: "Basic")
  - Controls LLM stats, thinking process visibility, and metadata shown on each message
  - See [chat/messages.md](./chat/messages.md) for per-mode details

### API

LLM provider configuration, saved explicitly (not auto-saved like other settings).

- Provider dropdown: "OpenAI", "Anthropic", "OpenRouter", "Custom"
- API key (password input, masked, stored server-side only. If a key is already saved, the field shows "••••••••" and a "Change" button.)
- API endpoint URL (text input, shown only for "Custom" provider. Default: https://api.openai.com/v1)
- Model selector (text input with placeholder "e.g., gpt-4o, claude-3.5-sonnet, ...")
- Max context tokens (number input, step 256, default 4096, min 1024, max 128000)
- Temperature (range slider: 0.0–2.0, step 0.1, default 1.0)
- "Test Connection" button: sends minimal request to verify the API key, shows green checkmark + "Connected" or red error with message
- "Save API Settings" button (primary, explicit save — avoids saving partial/invalid keys)

**Visibility**: API section visible only to admin and user roles. Hidden for viewer role.

### Data

- "Export All Chats" button: downloads JSON archive
- "Import Chats" button: opens file picker for JSON archive
- Danger zone (red-bordered section, at the bottom):
  - "Delete All Data" button (danger style)
  - Requires typing the word "DELETE" into a confirmation input to activate
  - On confirm: full data wipe, redirect to login

### About

- Application version (from package.json)
- "View Documentation" link → `/docs`
- "Source Code" link (external, to repository)
- Open source credits / licenses

## Auto-Save Behavior

General and Chat settings save on change (no explicit Save button). Each toggle/input sends an htmx PATCH to `/api/settings` on change. A small "Saved" indicator appears briefly when the request completes.

API settings require explicit save to avoid saving incomplete or invalid API keys.

## States

| State                  | Visual                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------ |
| Loading settings       | Skeleton form fields with shimmer                                                    |
| Auto-save success      | Brief green "Saved" indicator (fades after 1.5s) below the changed field             |
| Auto-save error        | Red "Failed to save" indicator, no data loss (last known value shown)                |
| Testing API connection | Button shows spinner, "Testing..." text                                              |
| API connection success | Button turns green, "Connected ✓" text for 3 seconds                                 |
| API connection failure | Button turns red, "Connection failed: [error message]"                               |
| Danger zone — delete   | Confirmation input appears, "DELETE" required, button activates once typed correctly |
| Delete complete        | Redirect to /login, data wiped                                                       |
