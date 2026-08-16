<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Frontend: Settings Page

**URL**: `/views/settings` (sidebar → Settings)

## Overview

User preferences and application configuration. Tabs across the top: **General,
Chat, API, Notifications, Data, Keys**. Each tab shows its own form; General and
Chat save on change, API requires an explicit save.

## Tabs

### General

- **Display name** (text input, updates the user's display name across the app)
- **Birth date** (date input — used for age-gate compliance)
- **Theme** (select): "Default (Dark)", "Light", "Bright", "Colorful",
  "Monochrome", "No Icons", "Dracula", "Nord", "GitHub Dark", "Material".
  Applied immediately via CSS sheet switching.
- **Language** (select): locale picker populated from the locale registry; the
  selection persists via `PATCH /api/i18n/locale`.

General changes auto-save on change (no explicit Save button).

### Chat

- **Enter to send** (toggle) — when off, Enter inserts a newline
- **Auto-scroll to bottom on new messages** (toggle)
- **Inline image preview** (toggle)
- **Message detail level** (select: "Immersion" / "Basic" / "Detailed")

Chat changes auto-save on change.

### API

LLM provider configuration. Requires explicit save (`Save` top-right) to avoid
persisting partial/invalid keys.

- Provider (select): "OpenAI", "Anthropic", "OpenRouter", "Custom"
- API key (password input; **Clear** button resets it)
- API endpoint URL (shown only for **Custom** provider)
- Model (text input)
- Max tokens (number, step 256, default 128000, min 1024, max 128000)
- Temperature (range slider 0.0–2.0, step 0.1)
- **Test Connection** button — sends a minimal request to verify the provider

### Notifications

- Per-type notification toggles (chat, world, system, etc.)
- **Muted worlds** — comma-separated list of world names to mute

### Data

- **Export All** — downloads a JSON archive of the user's data
- **Import Chats** — opens a file picker for a JSON archive
- **NSFW consent** — shows current NSFW status, max rating, and restrictions
- **Danger zone** (red-bordered): **Delete All Data** — requires typing
  `DELETE` into the confirmation input to activate; on confirm, wipes data and
  redirects to login

### Keys

Encryption key management — lists the user's encryption keys with rotation
controls. See `docs/spec/encryption.md` for the key model.

## Auto-Save Behavior

General and Chat settings save on change (no explicit Save button) — each
change sends a request to the settings API. API settings require the explicit
**Save** button.

## States

| State                  | Visual                                                           |
| ---------------------- | ---------------------------------------------------------------- |
| Loading settings       | Skeleton form fields with shimmer                                |
| Saving (Notifications) | "Saving…" muted text                                             |
| Testing API connection | Button shows spinner                                             |
| Danger zone — delete   | Confirmation input appears; button activates once `DELETE` typed |
| Delete complete        | Redirect to /login, data wiped                                   |

## See Also

- [User Guide: Settings](/guide/settings) — end-user walkthrough
- [Internationalization](/frontend/internationalization) — locale model
- [Encryption](/frontend/encryption) — key management details
