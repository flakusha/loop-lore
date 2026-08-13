# Settings

The settings page (sidebar → **Settings** / ⚙) is organized into tabs. This
guide describes what each tab does in the current web UI.

## Tabs

| Tab               | What it configures                                                   |
| ----------------- | -------------------------------------------------------------------- |
| **General**       | Display name, birth date, theme, and other account-level preferences |
| **Chat**          | Chat defaults (model behavior, message settings)                     |
| **API**           | Model provider, endpoint, API key, model, max tokens, temperature    |
| **Notifications** | Per-type notification toggles and mutes                              |
| **Data**          | Data/export controls                                                 |
| **Keys**          | Encryption key management                                            |

## General

- **Display name** — shown in the sidebar and chat.
- **Birth date** — used for age-gate compliance.
- **Theme** — pick from the built-in themes (default, light, bright, colorful,
  monochrome, no-icons, dracula, nord, github-dark, material). Changes apply
  immediately.

Use **Save** (top-right) to persist General changes.

## API

This tab is required for generation to work. Configure:

- **Provider** — the model provider (or **Custom** to set your own endpoint).
- **API endpoint** — shown for Custom provider.
- **API key** — required for hosted providers.
- **Model** — model identifier.
- **Max tokens** — generation length cap.
- **Temperature** — output randomness.

Click **Save** on this tab to persist. Without a working provider, chats won't
generate replies.

## Notifications

Toggle which notifications you receive (chat, world, system, etc.) and mute
specific types. The notification center (🔔 in the sidebar) shows unread items.

## See Also

- [Your First Chat](/guide/first-chat)
- [Frontend: Settings](/frontend/settings) — UI spec and states
- [Configuration](/spec/build-deploy) — server-side config files and env vars
